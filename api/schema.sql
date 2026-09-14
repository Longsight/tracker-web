create table races(
    raceid integer primary key autoincrement,
    `name` text unique,
    tag text unique,
    start_time integer,
    finish_time integer)
create table checkpoints(
    checkpointid integer primary key autoincrement,
    `name` text,
    race integer,
    `order` integer,
    coords text,
    distance integer,
    cumulative integer,
    foreign key(race) references races(raceid) on update cascade on delete cascade)
create unique index race_order on checkpoints(race, `order`)
create table competitors(
    competitorid integer primary key autoincrement,
    `name` text,
    bib integer,
    race integer,
    status integer,
    foreign key(race) references races(raceid) on update cascade on delete cascade)
create table trackers(
    mac text primary key,
    competitor integer,
    foreign key(competitor) references competitors(competitorid) on update cascade on delete set null)
create table tracks(
    trackid integer primary key autoincrement,
    competitor integer,
    timestamp integer,
    lat real,
    lon real,
    `temp` real,
    bat integer,
    foreign key(competitor) references competitors(competitorid) on update cascade on delete cascade)
create unique index competitor_timestamp on tracks(competitor, timestamp)
create table checkins(
    checkinid integer primary key autoincrement,
    competitor integer,
    checkpoint integer,
    timestamp integer,
    manual integer default 0,
    foreign key(competitor) references competitors(competitorid) on update cascade on delete cascade,
    foreign key(checkpoint) references checkpoints(checkpointid) on update cascade on delete cascade)
create unique index checkpoint_competitor on checkins(competitor, checkpoint)
