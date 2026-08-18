-- Optional second contact person for schools
ALTER TABLE schools
  ADD COLUMN contact_person2 VARCHAR(160) NULL,
  ADD COLUMN phone2          VARCHAR(60)  NULL,
  ADD COLUMN email2          VARCHAR(160) NULL,
  ADD COLUMN designation2    VARCHAR(160) NULL;
