"use client";
import { useEffect } from "react";

export default function LoginRedirect() {
  useEffect(() => {
    // Redirect to Cognito Hosted UI
    // You can fill in or import these from config/env
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI || "http://localhost:3001/auth/callback/cognito"
    );
    const scope = encodeURIComponent("openid profile email");
    const responseType = "token"; // for implicit, or "code" for auth code flow
    window.location.href =
      `https://${domain}/login?client_id=${clientId}` +
      `&response_type=${responseType}` +
      `&scope=${scope}` +
      `&redirect_uri=${redirectUri}`;
  }, []);

  return (
    <div style={{textAlign: 'center', marginTop: 80}}>
      <h2>Redirecting to login...</h2>
    </div>
  );
}