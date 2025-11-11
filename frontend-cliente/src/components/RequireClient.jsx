// src/components/RequireClient.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { getUser } from "../utils/session";

export default function RequireClient({ children }) {
  const u = getUser();
  if (!u) return <Navigate to="/" replace />;
  return children;
}
