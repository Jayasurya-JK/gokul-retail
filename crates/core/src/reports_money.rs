//! Expense and voided-line reports (a child of `reports`, so it shares the report builders).

use super::*;

pub(super) fn expenses_report(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let mut where_sql = "status='active' AND day >= ?1 AND day <= ?2".to_string();
    let mut args: Vec<Sql> = vec![p.from.clone().into(), p.to.clone().into()];
    if let Some(m) = p.mode.as_ref().filter(|m| !m.is_empty() && *m != "all") {
        where_sql.push_str(" AND paid_from=?3");
        args.push(m.clone().into());
    }
    let data = run(
        conn,
        &format!("SELECT day,number,category_name,paid_from,paid_to,note,by_name,approved_by,amount FROM expenses WHERE {where_sql} ORDER BY day DESC, id DESC"),
        args,
    )?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            json!({ "date": ss(&r[0]), "number": ss(&r[1]), "category": ss(&r[2]), "paidFrom": ss(&r[3]), "paidTo": ss(&r[4]), "note": ss(&r[5]),
                    "by": ss(&r[6]), "approvedBy": ss(&r[7]), "amount": si(&r[8]) })
        })
        .collect();
    let total = sum_i(&rows, "amount");
    let mut cats: BTreeMap<String, i64> = BTreeMap::new();
    for r in &rows {
        *cats.entry(r["category"].as_str().unwrap_or("").to_string()).or_default() += r["amount"].as_i64().unwrap_or(0);
    }
    let mut cat_rows: Vec<(String, i64)> = cats.into_iter().collect();
    cat_rows.sort_by(|a, b| b.1.cmp(&a.1));
    let cash: i64 = data.iter().filter(|r| ss(&r[3]) == "cash").map(|r| si(&r[8])).sum();
    let range = || -> Vec<Sql> { vec![p.from.clone().into(), p.to.clone().into()] };
    let voided = run(conn, "SELECT COUNT(*) FROM expenses WHERE status='void' AND day >= ?1 AND day <= ?2", range())?.first().map(|r| si(&r[0])).unwrap_or(0);
    let sales = run(conn, "SELECT COALESCE(SUM(taxable),0) FROM bills WHERE status != 'cancelled' AND day >= ?1 AND day <= ?2", range())?.first().map(|r| si(&r[0])).unwrap_or(0);
    Ok(json!({
        "id": "expenses", "title": "Expenses", "note": "Every active expense in the period. Voided entries are not counted.",
        "kpis": [kpi("Total expenses", "money", total, Some(format!("{} entries, {} voided", rows.len(), voided)), Some("warning")),
                 kpi("From cash drawer", "money", cash, None, None),
                 kpi("Biggest category", "text", cat_rows.first().map(|c| c.0.clone()).unwrap_or_else(|| "-".into()), cat_rows.first().map(|c| format!("{} rupees", rupees(c.1))), None),
                 kpi("% of sales (ex-GST)", "pct", pct(total, sales), None, None)],
        "chart": { "kind": "bars", "title": "Expenses by category", "money": true, "points": cat_rows.iter().take(8).map(|c| json!({ "label": c.0, "value": c.1 })).collect::<Vec<_>>() },
        "columns": [col("date","Date","date",Some("1fr")), col("number","No.","text",Some("0.9fr")), col("category","Category","text",Some("1.2fr")), col("paidFrom","Paid from","text",Some("0.8fr")),
                    col("paidTo","Paid to","text",Some("1.2fr")), col("note","Note","text",Some("1.6fr")), col("by","By","text",Some("0.8fr")), col("amount","Amount","money",None)],
        "rows": rows,
        "totals": { "date": "Total", "amount": total },
    }))
}

pub(super) fn voided_lines_report(conn: &Connection, p: &ReportParams) -> Result<Value> {
    let data = run(
        conn,
        "SELECT at,by_name,counter,code,name,qty,rate,amount,approved_by FROM voided_lines WHERE day >= ?1 AND day <= ?2 ORDER BY id DESC LIMIT 5000",
        vec![p.from.clone().into(), p.to.clone().into()],
    )?;
    let rows: Vec<Value> = data
        .iter()
        .map(|r| {
            let at = parse_iso(&ss(&r[0])).map(|d| d.format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default();
            json!({ "date": at, "by": ss(&r[1]), "counter": ss(&r[2]), "code": ss(&r[3]), "name": ss(&r[4]), "qty": si(&r[5]), "rate": si(&r[6]), "amount": si(&r[7]), "approvedBy": ss(&r[8]) })
        })
        .collect();
    let mut by_user: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    for r in &rows {
        let e = by_user.entry(r["by"].as_str().unwrap_or("").to_string()).or_default();
        e.0 += 1;
        e.1 += r["amount"].as_i64().unwrap_or(0);
    }
    let mut users: Vec<(String, (i64, i64))> = by_user.into_iter().collect();
    users.sort_by(|a, b| b.1 .0.cmp(&a.1 .0));
    Ok(json!({
        "id": "voided-lines", "title": "Voided lines", "note": "Items scanned and then removed from a bill before it was saved. A cashier removing many lines is worth a look.",
        "kpis": [kpi("Lines removed", "int", rows.len(), None, Some("warning")), kpi("Value removed", "money", sum_i(&rows, "amount"), None, None),
                 kpi("Most by", "text", users.first().map(|u| u.0.clone()).unwrap_or_else(|| "-".into()), users.first().map(|u| format!("{} lines", u.1 .0)), None)],
        "chart": { "kind": "bars", "title": "Removed lines by user", "money": false, "points": users.iter().take(8).map(|u| json!({ "label": u.0, "value": u.1 .0 })).collect::<Vec<_>>() },
        "columns": [col("date","When","text",Some("1.2fr")), col("by","Removed by","text",Some("1fr")), col("counter","Counter","text",Some("0.8fr")), col("code","Code","text",Some("0.8fr")),
                    col("name","Item","text",Some("2fr")), col("qty","Quantity","qty",Some("0.8fr")), col("amount","Value","money",None), col("approvedBy","Approved by","text",Some("1fr"))],
        "rows": rows,
        "totals": { "date": "Total", "amount": sum_i(&rows, "amount") },
    }))
}
