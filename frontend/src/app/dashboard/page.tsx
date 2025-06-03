"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";


type Receipt = {
  pk: string;
  sk: string;
  [key: string]: any;
};

// Fields to hide from the dashboard table
const HIDE_FIELDS = ["rawJson", "merchantInfo", "createdAt"];

export default function Dashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const accessToken = localStorage.getItem("cognito_access_token");
    if (!accessToken) {
      router.replace("/");
    } else {
      setLoggedIn(true);
      // Fetch receipts (if not already done)
      fetchReceipts(accessToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchReceipts = async (accessToken: string) => {
    try {
      setError(null);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiBase}/receipts`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const items = await res.json();
      setReceipts(items);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("cognito_id_token");
    localStorage.removeItem("cognito_access_token");
    router.replace("/");
  };

  if (!loggedIn) return null;

  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <h1>You are logged in!</h1>
      <p>Your ID token is stored locally. You can now use authenticated features.</p>
      <button onClick={handleLogout} style={{ marginTop: 24, padding: 10, fontSize: 16, borderRadius: 6 }}>Log out</button>
      <div style={{ marginTop: 40, textAlign: "center" }}>
        <h2>Your Receipts</h2>
        {error ? (
          <div style={{color:'red'}}>Error: {error}</div>
        ) : receipts.length > 0 ? (
          <table style={{ margin: "20px auto", borderCollapse: "collapse", maxWidth: 700, minWidth: 340 }}>
            <thead>
              <tr>
                {Object.keys(receipts[0])
                  .filter((col) => !HIDE_FIELDS.includes(col))
                  .map((col) => (
                    <th key={col} style={{ border: "1px solid #ccc", padding: 8 }}>{col}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, i) => (
                <tr key={i}>
                  {Object.entries(r)
                    .filter(([col]) => !HIDE_FIELDS.includes(col))
                    .map(([col, val], j) => (
                      <td key={j} style={{ border: "1px solid #ccc", padding: 7 }}>{val?.toString()}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>No receipts found.</div>
        )}
      </div>
    </div>
  );
}