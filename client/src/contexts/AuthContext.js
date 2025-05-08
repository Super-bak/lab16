import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      checkSession();
    } else {
      setLoading(false);
    }
  }, []);

  const checkSession = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Decode the token to get user info
      const decodedToken = jwtDecode(token);
      setUser({
        id: decodedToken.id,
        username: decodedToken.username
      });
      setError(null);
    } catch (error) {
      console.error('Session check failed:', error);
      localStorage.removeItem('token');
      setError('Session expired. Please login again.');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:5000/api/login', {
        username,
        password
      });
      const { token } = response.data;
      localStorage.setItem('token', token);
      
      // Decode the token to get user info
      const decodedToken = jwtDecode(token);
      setUser({
        id: decodedToken.id,
        username: decodedToken.username
      });
      
      setError(null);
      return decodedToken;
    } catch (error) {
      setError('Invalid username or password');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/register', {
        username,
        password,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setError(null);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 