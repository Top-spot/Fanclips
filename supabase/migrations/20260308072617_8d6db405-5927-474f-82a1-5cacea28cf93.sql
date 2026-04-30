
ALTER TABLE clips ADD COLUMN sport text;
ALTER TABLE clips ADD COLUMN school_team text;
ALTER TABLE clips ADD COLUMN location text;
ALTER TABLE clips ADD COLUMN event_date date DEFAULT CURRENT_DATE;
