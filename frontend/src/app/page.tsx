export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 100 }}>
      <h1>Welcome to the WhatsApp Receipts Dashboard</h1>
      <a href="/login">
        <button style={{ padding: 15, fontSize: 18, borderRadius: 6, marginTop: 40 }}>
          Login
        </button>
      </a>
    </main>
  );
}
