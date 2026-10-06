import re
from decimal import Decimal

from config.money import money

TOKEN = re.compile(r"\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[+\-*/()])")
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class FormulaError(Exception):
    pass


def extract_identifiers(expression):
    return [token for token in tokenize(expression) if IDENT.match(token) and not token[0].isdigit()]


def tokenize(expression):
    if not expression or not expression.strip():
        raise FormulaError("Formula is required.")
    position = 0
    tokens = []
    text = expression.strip()
    while position < len(text):
        match = TOKEN.match(text, position)
        if not match:
            raise FormulaError(f"Unexpected character at position {position + 1}.")
        tokens.append(match.group(1))
        position = match.end()
    if not tokens:
        raise FormulaError("Formula is required.")
    return tokens


class _Parser:
    def __init__(self, tokens, variables):
        self.tokens = tokens
        self.variables = variables
        self.position = 0

    def parse(self):
        value = self._expression()
        if self.position != len(self.tokens):
            raise FormulaError("Unexpected token in formula.")
        return value

    def _peek(self):
        if self.position >= len(self.tokens):
            return None
        return self.tokens[self.position]

    def _eat(self, expected=None):
        token = self._peek()
        if token is None or (expected is not None and token != expected):
            raise FormulaError("Formula is incomplete.")
        self.position += 1
        return token

    def _expression(self):
        value = self._term()
        while self._peek() in ("+", "-"):
            operator = self._eat()
            right = self._term()
            value = value + right if operator == "+" else value - right
        return value

    def _term(self):
        value = self._unary()
        while self._peek() in ("*", "/"):
            operator = self._eat()
            right = self._unary()
            if operator == "/" and right == 0:
                raise FormulaError("Division by zero.")
            value = value * right if operator == "*" else value / right
        return value

    def _unary(self):
        if self._peek() in ("+", "-"):
            operator = self._eat()
            value = self._unary()
            return value if operator == "+" else -value
        return self._primary()

    def _primary(self):
        token = self._peek()
        if token == "(":
            self._eat("(")
            value = self._expression()
            self._eat(")")
            return value
        if token is None:
            raise FormulaError("Formula is incomplete.")
        self._eat()
        if re.fullmatch(r"\d+(?:\.\d+)?", token):
            return Decimal(token)
        if token not in self.variables:
            raise FormulaError(f"Unknown field '{token}'.")
        return Decimal(self.variables[token])


def evaluate_formula(expression, variables):
    value = _Parser(tokenize(expression), variables).parse()
    return money(value)


def calculation_order(fields):
    calculated = [field for field in fields if field.is_calculated]
    dependencies = {}
    keys = {field.key for field in fields}
    for field in calculated:
        try:
            refs = extract_identifiers(field.formula or "")
        except FormulaError as exc:
            raise FormulaError(str(exc)) from exc
        unknown = [ref for ref in refs if ref not in keys]
        if unknown:
            raise FormulaError(f"Formula for {field.key} uses unknown fields: {', '.join(unknown)}.")
        if field.key in refs:
            raise FormulaError(f"Field {field.key} cannot reference itself.")
        dependencies[field.key] = refs

    pending = {field.key: set(dependencies[field.key]) & {item.key for item in calculated} for field in calculated}
    ordered_keys = []
    ready = [key for key, deps in pending.items() if not deps]
    while ready:
        key = ready.pop()
        ordered_keys.append(key)
        for other, deps in pending.items():
            if key in deps:
                deps.remove(key)
                if not deps and other not in ordered_keys and other not in ready:
                    ready.append(other)
    if len(ordered_keys) != len(calculated):
        raise FormulaError("Calculated fields contain a circular reference.")
    by_key = {field.key: field for field in calculated}
    return [by_key[key] for key in ordered_keys]
