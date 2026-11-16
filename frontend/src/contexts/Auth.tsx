import React, { createContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import axios from "../axios";

type ContextProps = {
  children: JSX.Element;
};

export type User = {
  id: number;
  name: string;
  admin: boolean;
  email?: string;
  voterId?: string;
  citizenshipNumber?: string;
  verified?: boolean;
  emailVerified?: boolean;
  isActive?: boolean;
};

export const AuthContext = createContext({
  id: 0,
  name: "",
  email: "",
  voterId: "",
  isAdmin: false,
  verified: false,
  emailVerified: false,
  authenticated: false,
  accessToken: "",
  loading: true,
  authenticate: (user: User, token: string, redirect?: boolean) => {},
  logout: () => {},
});

const AuthProvider = (props: ContextProps): JSX.Element => {
  const navigate = useNavigate();

  const [authentication, setAuthentication] = useState({
    id: 0,
    name: "",
    email: "",
    voterId: "",
    isAdmin: false,
    verified: false,
    emailVerified: false,
    authenticated: false,
    accessToken: "",
    loading: true,
  });

  const authenticate = useCallback(
    (user: User, token: string, redirect: boolean = true) => {
      setAuthentication({
        id: user.id,
        name: user.name,
        email: user.email || "",
        voterId: user.voterId || "",
        isAdmin: Boolean(user.admin),
        verified: Boolean(user.verified),
        emailVerified: Boolean(user.emailVerified),
        authenticated: true,
        accessToken: token,
        loading: false,
      });

      if (redirect) navigate("/");
    },
    [navigate]
  );

  const checkAuthentication = useCallback(() => {
    axios
      .post("/auth/check")
      .then((res) => authenticate(res.data.user, res.data.accessToken, false))
      .catch(() => {
        setAuthentication((prev) => ({ ...prev, authenticated: false, loading: false }));
      });
  }, [authenticate]);

  useEffect(() => {
    checkAuthentication();
    const interval = setInterval(checkAuthentication, 30 * 1000);
    return () => clearInterval(interval);
  }, [checkAuthentication]);

  const logout = async () => {
    try {
      await axios.post("/auth/logout");
    } catch {
      // Ignore network errors on logout
    }

    setAuthentication({
      id: 0,
      name: "",
      email: "",
      voterId: "",
      isAdmin: false,
      verified: false,
      emailVerified: false,
      authenticated: false,
      accessToken: "",
      loading: false,
    });

    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{
        id: authentication.id,
        name: authentication.name,
        email: authentication.email,
        voterId: authentication.voterId,
        isAdmin: authentication.isAdmin,
        verified: authentication.verified,
        emailVerified: authentication.emailVerified,
        authenticated: authentication.authenticated,
        accessToken: authentication.accessToken,
        loading: authentication.loading,
        authenticate,
        logout,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
