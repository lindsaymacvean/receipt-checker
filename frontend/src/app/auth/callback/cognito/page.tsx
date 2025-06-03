"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CognitoCallback() {
  const router = useRouter();

  useEffect(() => {
    // Extract token(s) from URL fragment (#id_token=...&access_token=...)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get("id_token");
    const accessToken = params.get("access_token");
    if (idToken && accessToken) {
      // Store in cookies or localStorage (for demo: localStorage)
      localStorage.setItem("cognito_id_token", idToken);
      localStorage.setItem("cognito_access_token", accessToken);
      // Optional: clear fragment from URL
      window.location.hash = "";
      // Redirect to dashboard
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div style={{textAlign: 'center', marginTop: 80}}>
      <h2>Handling login callback...</h2>
    </div>
  );
}