CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE INDEX idx_notes_created_at ON notes (created_at);
