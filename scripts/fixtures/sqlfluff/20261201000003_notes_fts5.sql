CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');
