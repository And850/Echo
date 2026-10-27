import { useState, useEffect } from 'react'

import './App.css'

function App() {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

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
    async function fetchProposals() {
      try {
        const response = await fetch(`/api/proposals?status=${statusFilter}&sort=${sortBy}&order=${sortOrder}`);
        if (response.ok) {
          const data = await response.json();
          setProposals(data);
        } else {
          const errorData = await response.json();
          setMessage(`Failed to fetch proposals: ${errorData.error}`);
        }
      } catch (error) {
        setMessage(`Failed to fetch proposals: ${error.message}`);
      }
    }

    if (user) {
      fetchProposals();
    } 
    else {
      setProposals([]);
    }
  }, [user, statusFilter, sortBy, sortOrder]);

    

  async function handleLogin(event){
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");


    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();


    if (response.ok) {
      setMessage(`Logged in as ${data.email}`);
      setUser(data);
    } else {
      setMessage(`Login failed: ${data.error}`);
    }
  }


  async function handleLogout() {
    const response = await fetch("/api/logout", {
      method: "POST"
    });

    if (response.ok) {
      setMessage("");
      setUser(null);
    } else {
      const data = await response.json();
      setMessage(`Logout failed: ${data.error}`);
    }
  }

  async function handleVote(proposalId, voteValue, currentVote) {
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
    } else {
      setMessage(`Vote failed: ${data.error}`);
    }
  }


  if (checkingSession) {
    return <p>Loading...</p>;
  }

  

  return (
    <main>  
      <h1>Echo</h1>
{ user ? (
  <>
  <p> Logged in as {user.email} </p>
  <p role="status">{message}</p>
  <button onClick={handleLogout}>Log out</button>

  {proposals.length === 0 ? (
    <p>No proposals available</p>
  ) : (
    <p>{proposals.length} proposals loaded</p>
  )}

  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
    <option value="all">All</option>
    <option value="pending">Pending</option>
    <option value="approved">Approved</option>
    <option value="denied">Denied</option>
  </select>

  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
    <option value="date">Sort by Date</option>
    <option value="score">Sort by Score</option>
  </select>

  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
    <option value="desc">Descending</option>
    <option value="asc">Ascending</option>
  </select>

  {proposals.map(proposal => (
    <article key={proposal.id}>
        <h2>{proposal.title}</h2>
        <p>{proposal.description}</p>
        <p>Status: {proposal.status}</p>
        <p>Score: {proposal.net_score}</p>

        { user.role === "student" && !proposal.is_own && (
          <>
            <button type="button" onClick={() => handleVote(proposal.id, 1, proposal.my_vote)} aria-pressed={Number(proposal.my_vote) === 1}>Upvote</button>
            <button type="button" onClick={() => handleVote(proposal.id, -1, proposal.my_vote)} aria-pressed={Number(proposal.my_vote) === -1}>Downvote</button>
          </>
        )}
    </article>
))}
  </>
) : (
  <>
    <p>Log in to view proposals</p>
      <form className="login-form" onSubmit={handleLogin}>
        <label htmlFor="email">School email</label>
        <input type="email" name="email" required id="email"/>
        <label htmlFor="password">Password</label>
        <input type="password" name="password" required id="password"/>
        <button type="submit">Log in</button>        
      </form>
      <p role="status">{message}</p>
  </>
)}
      
    </main>
  )
}

export default App
