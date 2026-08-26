ALTER TABLE operator_crawl_runs
ADD COLUMN search_fingerprint TEXT;

CREATE UNIQUE INDEX ux_operator_crawl_search_fingerprint
ON operator_crawl_runs(search_fingerprint)
WHERE search_fingerprint IS NOT NULL AND retry_of_run_id IS NULL;
