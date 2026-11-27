create table Tags(id integer primary key,
  Name text not null unique ,created_at text not null default (datetime('now')))
;
select id,Name from Tags where Name is not null
