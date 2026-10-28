import { useState, useEffect, useRef } from 'react'

import './App.css'

function App() {
  const [message, setMessage] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalsError, setProposalsError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [feedVersion, setFeedVersion] = useState(0);
  const [expandedProposalId, setExpandedProposalId] = useState(null);
  const [comments, setComments] = useState([]); // { proposalId: [comments] }
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const discussionContextRef = useRef({ proposalId: null, userId: null });

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/me");

        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        setMessage(`Unable to check session: ${error.message}`);
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchProposals() {
      setLoadingProposals(true);
      setProposalsError("");
      try {
        const response = await fetch(`/api/proposals?status=${statusFilter}&sort=${sortBy}&order=${sortOrder}`);
        const data = await response.json();
        if (cancelled) return;

        if (response.ok) {
          setProposals(data);
        } else {
          setProposals([]);
          setProposalsError(`Failed to fetch proposals: ${data.error}`);
        }
      } catch (error) {
        if (!cancelled) {
          setProposals([]);
          setProposalsError(`Failed to fetch proposals: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setLoadingProposals(false);
        }
      }
    }

    if (user) {
      fetchProposals();
    }

    return () => {
      cancelled = true;
    };
  }, [user, statusFilter, sortBy, sortOrder, feedVersion]);



  async function handleLogin(event) {
    event.preventDefault();
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");
    try {
      const response = await fetch(isSigningUp ? "/api/signup" : "/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(isSigningUp ? "Account created successfully" : "Logged in successfully");
        discussionContextRef.current = { proposalId: null, userId: data.id };
        setUser(data);
      } else {
        setMessage(`${isSigningUp ? "Signup" : "Login"} failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }


  async function handleLogout() {
    setMessage("");
    try {
      const response = await fetch("/api/logout", {
        method: "POST"
      });

      if (response.ok) {
        setMessage("");
        discussionContextRef.current = { proposalId: null, userId: null };
        setUser(null);
        setProposals([]);
        setLoadingProposals(false);
        setProposalsError("");
        setExpandedProposalId(null);
        setComments([]);
        setLoadingComments(false);
        setCommentsError("");
        setIsSigningUp(false);
      } else {
        const data = await response.json();
        setMessage(`Logout failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }

  async function handleVote(proposalId, voteValue, currentVote) {
    setMessage("");
    try {
      const retracting = Number(currentVote) === voteValue;

      let response;
      if (retracting) {
        response = await fetch(`/api/proposals/${proposalId}/vote`, {
          method: "DELETE"
        });
      } else {
        response = await fetch(`/api/proposals/${proposalId}/vote`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ value: voteValue })
        });
      }

      const data = await response.json();

      if (response.ok) {
        setProposals(prevProposals => prevProposals.map(proposal =>
          proposal.id === proposalId ? { ...proposal, net_score: data.net_score, my_vote: data.my_vote } : proposal
        ));
        setFeedVersion(previous => previous + 1);
      } else {
        setMessage(`Vote failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }

  async function handleModerate(proposalId, newStatus) {
    setMessage("");
    try {
      const response = await fetch(`/api/proposals/${proposalId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok) {
        setFeedVersion(previous => previous + 1);
      } else {
        setMessage(`Moderation failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }


  async function handleProposalSubmit(event) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = formData.get("title");
    const description = formData.get("description");

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title, description })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Proposal submitted successfully");
        setFeedVersion(previous => previous + 1);
        form.reset();
      } else {
        setMessage(`Proposal submission failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }

  useEffect(() => {
    if (!expandedProposalId || !user) {
      return;
    }
    let cancelled = false;
    async function fetchComments() {
      setLoadingComments(true);
      setCommentsError("");
      try {
        const response = await fetch(
          `/api/proposals/${expandedProposalId}/comments`
        );
        const data = await response.json();
        if (cancelled) return;
        if (response.ok) {
          setComments(data);
        } else {
          setComments([]);
          setCommentsError(data.error);
        }
      } catch (error) {
        if (!cancelled) {
          setComments([]);
          setCommentsError(`Unable to connect: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setLoadingComments(false);
        }
      }
    }

    fetchComments();
    return () => {
      cancelled = true;
    };
  }, [expandedProposalId, user]);

  function handleDiscussionToggle(proposalId) {
    if (isPostingComment) return;
    setMessage("");
    if (expandedProposalId === proposalId) {
      discussionContextRef.current = { proposalId: null, userId: user?.id };
      setExpandedProposalId(null);
      setComments([]);
      setLoadingComments(false);
      setCommentsError("");
    } else {
      discussionContextRef.current = { proposalId, userId: user?.id };
      setExpandedProposalId(proposalId);
      setComments([]);
      setLoadingComments(true);
      setCommentsError("");
    }
  }

  async function handlePostComment(event) {
    event.preventDefault();
    if (isPostingComment) return;
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = formData.get("body");
    const postingContext = {
      proposalId: expandedProposalId,
      userId: user?.id
    };

    setIsPostingComment(true);
    try {
      const response = await fetch(
        `/api/proposals/${postingContext.proposalId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ body })
        }
      );
      const data = await response.json();

      if (response.ok) {
        const stillInPostingDiscussion =
          discussionContextRef.current.proposalId === postingContext.proposalId &&
          discussionContextRef.current.userId === postingContext.userId;
        if (stillInPostingDiscussion) {
          setComments(previous => [...previous, { ...data, replies: [] }]);
          form.reset();
        }
      } else {
        const stillInPostingDiscussion =
          discussionContextRef.current.proposalId === postingContext.proposalId &&
          discussionContextRef.current.userId === postingContext.userId;
        if (stillInPostingDiscussion) {
          setMessage(data.error);
        }
      }
    } catch (error) {
      const stillInPostingDiscussion =
        discussionContextRef.current.proposalId === postingContext.proposalId &&
        discussionContextRef.current.userId === postingContext.userId;
      if (stillInPostingDiscussion) {
        setMessage(`Unable to connect: ${error.message}`);
      }
    } finally {
      setIsPostingComment(false);
    }
  }

  async function handlePostReply(event, commentId) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = formData.get("body");

    try {
      const response = await fetch(
        `/api/comments/${commentId}/replies`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ body })
        }
      );
      const data = await response.json();
      if (response.ok) {
        setComments(previous => previous.map(comment =>
          comment.id === commentId
            ? { ...comment, replies: [...comment.replies, data] }
            : comment
        ));
        form.reset();
      } else {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage(`Unable to connect: ${error.message}`);
    }
  }

  if (checkingSession) {
    return <p>Loading...</p>;
  }



  return (
    <main>
      <header className="app-header">
        <h1>Echo</h1>
        {user && (
          <div className="header-account">
            <p>Logged in as {user.email}</p>
            <button onClick={handleLogout}>Log out</button>
          </div>
        )}
      </header>
      {message && <p className="app-message" role="status">{message}</p>}
      {user ? (
        <>
          <div className="feed-toolbar">
            <div className="toolbar-control">
              <label htmlFor="status-filter">Status</label>
              <select id="status-filter" value={statusFilter} onChange={(event) => {
                setStatusFilter(event.target.value);
                setMessage("");
              }}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
              </select>
            </div>

            <div className="toolbar-control">
              <label htmlFor="sort-by">Sort by</label>
              <select id="sort-by" value={sortBy} onChange={(event) => {
                setSortBy(event.target.value);
                setMessage("");
              }}>
                <option value="date">Date</option>
                <option value="score">Score</option>
              </select>
            </div>

            <div className="toolbar-control">
              <label htmlFor="sort-order">Order</label>
              <select id="sort-order" value={sortOrder} onChange={(event) => {
                setSortOrder(event.target.value);
                setMessage("");
              }}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          {user.role === "student" && (
            <form className="proposal-form" onSubmit={handleProposalSubmit}>
              <label htmlFor="title">Title</label>
              <input type="text" name="title" id="title" required minLength={4} maxLength={100} />
              <label htmlFor="description">Description</label>
              <textarea name="description" required id="description" minLength={4} maxLength={2000}></textarea>
              <button type="submit">Submit Proposal</button>
            </form>
          )}

          {loadingProposals ? (
            <p>Loading proposals…</p>
          ) : proposalsError ? (
            <p role="alert">{proposalsError}</p>
          ) : proposals.length === 0 ? (
            <p>No proposals available</p>
          ) : (
            <p>{proposals.length} proposals loaded</p>
          )}

          {!loadingProposals && !proposalsError && proposals.map(proposal => (
            <article key={proposal.id} className="proposal-card">
              <h2>{proposal.title}</h2>
              <p className="proposal-description">{proposal.description}</p>
              <p>Status: {proposal.status}</p>
              <p>Score: {proposal.net_score}</p>
              <p className="proposal-date">Created: {formatDate(proposal.created_at)}</p>

              <div className="proposal-actions">
                {user.role === "student" && !proposal.is_own && (
                  <>
                    <button type="button" onClick={() => handleVote(proposal.id, 1, proposal.my_vote)} aria-pressed={Number(proposal.my_vote) === 1}>Upvote</button>
                    <button type="button" onClick={() => handleVote(proposal.id, -1, proposal.my_vote)} aria-pressed={Number(proposal.my_vote) === -1}>Downvote</button>
                  </>
                )}

                {user.role === "staff" && proposal.status === "pending" && (
                  <>
                    <button type="button" onClick={() => handleModerate(proposal.id, "approved")}>Approve</button>
                    <button type="button" onClick={() => handleModerate(proposal.id, "denied")}>Deny</button>
                  </>
                )}

                <button type="button" onClick={() => handleDiscussionToggle(proposal.id)} disabled={isPostingComment}>
                  {expandedProposalId === proposal.id ? "Hide discussion" : "View discussion"}
                </button>
              </div>
              {expandedProposalId === proposal.id && (
                <section className="discussion">
                  <h3>Discussion</h3>
                  {loadingComments ? (
                    <p>Loading discussion…</p>
                  ) : commentsError ? (
                    <p role="alert">{commentsError}</p>
                  ) : comments.length === 0 ? (
                    <p>No comments yet</p>
                  ) : (
                    comments.map(comment => (
                      <div className="comment-item" key={comment.id}>
                        <p className="comment-body">{comment.body}</p>

                        {comment.replies.map(reply => (
                          <blockquote className="reply-item" key={reply.id}>
                            {reply.body}
                          </blockquote>
                        ))}

                        {user.role === "student" && proposal.is_own && (
                          <form className="reply-form" onSubmit={event => handlePostReply(event, comment.id)}>
                            <label htmlFor={`reply-body-${comment.id}`}>Reply</label>
                            <textarea id={`reply-body-${comment.id}`} name="body" required minLength={10} maxLength={2000}></textarea>
                            <button type="submit">Post reply</button>
                          </form>
                        )}
                      </div>
                    ))
                  )}

                  {user.role === "staff" && (
                    <form className="comment-form" onSubmit={handlePostComment}>
                      <label htmlFor="comment-body">Comment</label>
                      <textarea id="comment-body" name="body" required minLength={10} maxLength={2000}></textarea>
                      <button type="submit" disabled={isPostingComment}>
                        {isPostingComment ? "Posting…" : "Post comment"}
                      </button>
                    </form>
                  )}
                </section>
              )}
            </article>
          ))}
        </>
      ) : (
        <>
          <p>{!isSigningUp ? "Log in to view proposals" : "Sign up to view proposals"}</p>
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="email">School email</label>
            <input type="email" name="email" required id="email" />
            <label htmlFor="password">Password</label>
            <input type="password" name="password" required id="password" />
            {isSigningUp && (
              <p>Password must be at least 8 characters, including a letter and a number.</p>
            )}
            <button type="submit">{isSigningUp ? "Sign up" : "Log in"}</button>
          </form>
          <button
            type="button"
            onClick={() => {
              setIsSigningUp(previous => !previous);
              setMessage("");
            }}
          >
            {isSigningUp ? "Already registered? Log in" : "Create an account"}
          </button>
        </>
      )}

    </main>
  )
}

export default App
