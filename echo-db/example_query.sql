-- Proposals with their computed net score (upvotes minus downvotes),
-- filtered by status (or not filtered, with 'all') and sorted by net score
-- descending (SC5, decision 2).
-- Only the aggregate is returned, never who voted which way (SC6).
-- $1 = 'pending' | 'approved' | 'denied' | 'all'
SELECT
    p.id,
    p.title,
    p.description,
    p.status,
    p.created_at,
    COALESCE(SUM(v.value), 0) AS net_score
FROM proposals p
LEFT JOIN votes v ON v.proposal_id = p.id
WHERE ($1 = 'all' OR p.status = $1)
GROUP BY p.id
ORDER BY net_score DESC, p.created_at DESC;
