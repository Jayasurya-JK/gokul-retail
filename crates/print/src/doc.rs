//! A receipt as a list of simple operations. Layout (columns, wrapping, alignment) happens later, per paper width.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Style {
    pub bold: bool,
    /// Double width and height (halves the columns on the line).
    pub big: bool,
    pub align: Align,
}

impl Style {
    pub const NORMAL: Style = Style { bold: false, big: false, align: Align::Left };
    pub const fn bold(mut self) -> Style {
        self.bold = true;
        self
    }
    pub const fn big(mut self) -> Style {
        self.big = true;
        self
    }
    pub const fn center(mut self) -> Style {
        self.align = Align::Center;
        self
    }
}

#[derive(Debug, Clone)]
pub enum Op {
    /// Text wrapped to the paper width and aligned by the style.
    Text(String, Style),
    /// Left text (wraps if long) and a right-aligned value on its last line.
    Pair(String, String, Style),
    /// Table row: (text, width in columns, 0 = takes the rest, alignment). At most one cell may take the rest.
    Cols(Vec<(String, usize, Align)>, Style),
    /// A rule across the paper made of this character.
    Rule(char),
    Blank(u8),
    Logo,
    /// Printed by the printer itself (ESC/POS) as a QR code.
    Qr(String),
    /// Code 128 barcode with the number printed under it.
    Barcode(String),
    /// Kick the cash drawer.
    Drawer,
    Cut,
}

#[derive(Debug, Clone, Default)]
pub struct Doc {
    pub ops: Vec<Op>,
}

impl Doc {
    pub fn new() -> Doc {
        Doc::default()
    }
    pub fn push(&mut self, op: Op) -> &mut Doc {
        self.ops.push(op);
        self
    }
    pub fn text(&mut self, s: impl Into<String>, st: Style) -> &mut Doc {
        self.push(Op::Text(s.into(), st))
    }
    pub fn line(&mut self, s: impl Into<String>) -> &mut Doc {
        self.push(Op::Text(s.into(), Style::NORMAL))
    }
    pub fn pair(&mut self, l: impl Into<String>, r: impl Into<String>) -> &mut Doc {
        self.push(Op::Pair(l.into(), r.into(), Style::NORMAL))
    }
    pub fn pair_styled(&mut self, l: impl Into<String>, r: impl Into<String>, st: Style) -> &mut Doc {
        self.push(Op::Pair(l.into(), r.into(), st))
    }
    pub fn rule(&mut self) -> &mut Doc {
        self.push(Op::Rule('-'))
    }
}
