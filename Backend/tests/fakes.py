COMPLAINT_ID = "99999999-8888-7777-6666-555555555555"


class FakeResult:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = {}

    def select(self, *args, **kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        return self.db.respond(self)


class FakeBucket:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def upload(self, path, data, options):
        self.db.uploads[(self.name, path)] = data

    def remove(self, paths):
        for path in paths:
            self.db.uploads.pop((self.name, path), None)

    def download(self, path):
        return self.db.uploads.get((self.name, path), b"image")

    def get_public_url(self, path):
        return f"https://storage.test/{self.name}/{path}"

    def create_signed_url(self, path, expires_in):
        return {"signedURL": f"https://signed.test/{self.name}/{path}?expires={expires_in}"}


class FakeStorage:
    def __init__(self, db):
        self.db = db

    def from_(self, name):
        return FakeBucket(self.db, name)


class FakeSupabase:
    def __init__(self, recent=0, responses=None):
        self.recent = recent
        self.responses = responses or {}
        self.inserted = {}
        self.updated = []
        self.queries = []
        self.uploads = {}
        self.storage = FakeStorage(self)

    def table(self, name):
        return FakeQuery(self, name)

    def respond(self, query):
        self.queries.append(query)
        key = (query.table, query.op)
        if query.op == "insert":
            rows = query.payload if isinstance(query.payload, list) else [query.payload]
            self.inserted.setdefault(query.table, []).extend(rows)
        if query.op == "update":
            self.updated.append((query.table, query.payload, dict(query.filters)))
        if key in self.responses:
            response = self.responses[key]
            return FakeResult(response(query) if callable(response) else response)
        if key == ("complaints", "select"):
            return FakeResult([], count=self.recent)
        if key == ("buildings", "select"):
            return FakeResult([{"id": query.filters.get("id")}])
        if key == ("complaints", "insert"):
            return FakeResult([{"id": COMPLAINT_ID, "ref_no": 42, **query.payload}])
        if query.op == "insert":
            return FakeResult(query.payload if isinstance(query.payload, list) else [query.payload])
        return FakeResult([])
