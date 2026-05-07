UPDATE flight_logs
SET notes = REPLACE(notes, 'Min batteri: -1%', 'Min batteri: N/A')
WHERE notes LIKE '%Min batteri: -1\%%';