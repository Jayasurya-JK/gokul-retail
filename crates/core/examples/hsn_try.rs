fn main() {
    let names: Vec<String> = std::env::args().skip(1).collect();
    let list = if names.is_empty() { std::io::stdin().lines().map(|l| l.unwrap()).collect() } else { names };
    for n in list {
        match gokul_core::hsn::suggest(&n) {
            Some(s) => println!("{:55} -> {} {:6} [{}] alt={:?}", n, s.hsn, s.confidence, s.matched, s.alternatives.iter().map(|a| a.hsn.clone()).collect::<Vec<_>>()),
            None => println!("{:55} -> none", n),
        }
    }
}
