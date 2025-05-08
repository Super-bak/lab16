import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Snackbar, Alert } from '@mui/material';
import io from 'socket.io-client';
import axios from 'axios';

const Chat = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const messagesEndRef = useRef(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const socketRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showJoinGroupDialog, setShowJoinGroupDialog] = useState(false);
  const [groupCode, setGroupCode] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const checkSession = useCallback(async () => {
    try {
      await axios.get('http://localhost:5000/api/session');
    } catch (error) {
      if (error.response?.status === 401) {
        logout();
      }
    }
  }, [logout]);

  const fetchFriends = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friends/${user.id}`, {
        headers: getAuthHeaders()
      });
      if (response.data && Array.isArray(response.data)) {
        setFriends(response.data);
      } else {
        setFriends([]);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
      setFriends([]);
    }
  }, [user?.id]);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/friends/pending/${user.id}`, {
        headers: getAuthHeaders()
      });
      if (response.data && Array.isArray(response.data)) {
        setPendingRequests(response.data);
      } else {
        setPendingRequests([]);
      }
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      setPendingRequests([]);
    }
  }, [user?.id]);

  const fetchGroups = useCallback(async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/groups/${user.id}`, {
        headers: getAuthHeaders()
      });
      if (response.data && Array.isArray(response.data)) {
        setGroups(response.data);
      } else {
        setGroups([]);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroups([]);
    }
  }, [user?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize socket connection
  useEffect(() => {
    if (user) {
      console.log('Initializing socket connection for user:', user.id);
      
      socketRef.current = io('http://localhost:5000', {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      const socket = socketRef.current;

      socket.on('connect', () => {
        console.log('Socket connected');
        setConnectionStatus('connected');
        socket.emit('join', user.id);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setConnectionStatus('error');
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (socketRef.current) {
            socketRef.current.connect();
          }
        }, 5000);
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setConnectionStatus('disconnected');
        // Attempt to reconnect if the disconnect was not initiated by the client
        if (reason !== 'io client disconnect') {
          setTimeout(() => {
            if (socketRef.current) {
              socketRef.current.connect();
            }
          }, 5000);
        }
      });

      // Add friend request event listeners
      socket.on('friend_request', (data) => {
        console.log('Received friend request:', data);
        fetchPendingRequests();
        // Show a notification
        setError(`New friend request from ${data.username}!`);
      });

      socket.on('friend_accepted', (data) => {
        console.log('Friend request accepted:', data);
        fetchFriends();
        fetchPendingRequests();
        // Show a notification
        setError(`${data.username} accepted your friend request!`);
      });

      socket.on('private message', (message) => {
        console.log('Received message:', message);
        if (selectedFriend && 
            (message.senderId === selectedFriend.id || 
             message.receiverId === selectedFriend.id)) {
          setMessages(prev => {
            // Check if message already exists to prevent duplicates
            const messageExists = prev.some(msg => 
              msg.senderId === message.senderId && 
              msg.content === message.content && 
              new Date(msg.timestamp).getTime() === new Date(message.timestamp).getTime()
            );
            if (messageExists) return prev;
            return [...prev, {
              ...message,
              timestamp: new Date(message.timestamp),
              isSent: message.senderId === user.id
            }];
          });
        }
      });

      socket.on('group message', (message) => {
        console.log('Received group message:', message);
        if (selectedGroup && message.groupId === selectedGroup.id) {
          setMessages(prev => {
            // Check if message already exists to prevent duplicates
            const messageExists = prev.some(msg => 
              msg.senderId === message.senderId && 
              msg.content === message.content && 
              new Date(msg.timestamp).getTime() === new Date(message.timestamp).getTime()
            );
            if (messageExists) return prev;
            return [...prev, {
              ...message,
              timestamp: new Date(message.timestamp),
              isSent: message.senderId === user.id
            }];
          });
        }
      });

      return () => {
        console.log('Cleaning up socket connection');
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [user, selectedFriend, selectedGroup, fetchFriends, fetchPendingRequests]);

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchGroups();
      fetchPendingRequests();

      const sessionCheckInterval = setInterval(() => {
        checkSession();
      }, 5 * 60 * 1000);

      return () => {
        clearInterval(sessionCheckInterval);
      };
    }
  }, [user, checkSession, fetchFriends, fetchGroups, fetchPendingRequests]);

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    setSelectedGroup(null);
    localStorage.setItem('selectedFriend', JSON.stringify(friend));
    localStorage.removeItem('selectedGroup');
    setMessages([]);
    fetchMessages(friend.id);
  };

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSelectedFriend(null);
    localStorage.setItem('selectedGroup', JSON.stringify(group));
    localStorage.removeItem('selectedFriend');
    setMessages([]);
    fetchGroupMessages(group.id);
  };

  const fetchMessages = async (friendId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/${user.id}/${friendId}`, {
        headers: getAuthHeaders()
      });
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data.map(msg => ({
          ...msg,
          timestamp: new Date(msg.created_at),
          isSent: msg.sender_id === user.id
        })));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError('Failed to load messages. Please try again.');
    }
  };

  const fetchGroupMessages = async (groupId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/groups/${groupId}/messages`, {
        headers: getAuthHeaders()
      });
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data.map(msg => ({
          ...msg,
          timestamp: new Date(msg.created_at),
          isSent: msg.sender_id === user.id
        })));
      }
    } catch (error) {
      console.error('Error fetching group messages:', error);
      setError('Failed to load group messages. Please try again.');
    }
  };

  // Add useEffect to maintain selected states and fetch messages
  useEffect(() => {
    if (selectedFriend) {
      fetchMessages(selectedFriend.id);
    } else if (selectedGroup) {
      fetchGroupMessages(selectedGroup.id);
    }
  }, [selectedFriend, selectedGroup]);

  const handleSendMessage = (e) => {
    e.preventDefault(); // Prevent form submission from refreshing the page
    if (!newMessage.trim() || (!selectedFriend && !selectedGroup)) return;

    const messageData = {
      senderId: user.id,
      content: newMessage,
      timestamp: new Date().toISOString(),
      isSent: true
    };

    if (selectedFriend) {
      messageData.receiverId = selectedFriend.id;
      socketRef.current.emit('private message', messageData);
    } else if (selectedGroup) {
      messageData.groupId = selectedGroup.id;
      socketRef.current.emit('group message', messageData);
    }

    setNewMessage('');
  };

  const handleAddFriend = async () => {
    try {
      if (!friendUsername.trim()) {
        setError('Please enter a username');
        return;
      }

      const response = await axios.post('http://localhost:5000/api/friends/request', {
        userId: user.id,
        friendUsername: friendUsername.trim()
      }, {
        headers: getAuthHeaders()
      });

      if (response.data) {
        setShowAddFriendDialog(false);
        setFriendUsername('');
        setError(null);
        // Show success message
        setError('Friend request sent successfully!');
        // Refresh pending requests
        fetchPendingRequests();
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      setError(error.response?.data?.error || 'Failed to send friend request');
    }
  };

  const handleCreateGroup = async () => {
    try {
      if (!groupName.trim()) {
        setError('Please enter a group name');
        return;
      }

      const response = await axios.post('http://localhost:5000/api/groups', {
        name: groupName.trim(),
        createdBy: user.id
      }, {
        headers: getAuthHeaders()
      });

      if (response.data) {
        setShowCreateGroupDialog(false);
        setGroupName('');
        fetchGroups();
        setError(`Group created successfully! Share this code to invite others: ${response.data.group.code}`);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      setError(error.response?.data?.error || 'Failed to create group');
    }
  };

  const handleAcceptRequest = async (friendId) => {
    try {
      const response = await axios.post('http://localhost:5000/api/friends/accept', {
        userId: user.id,
        friendId
      }, {
        headers: getAuthHeaders()
      });

      if (response.data) {
        fetchPendingRequests();
        fetchFriends();
        setError(null);
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      setError(error.response?.data?.error || 'Failed to accept friend request');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleJoinGroup = async () => {
    try {
      if (!groupCode.trim()) {
        setError('Please enter a group code');
        return;
      }

      const response = await axios.post('http://localhost:5000/api/groups/join', {
        userId: user.id,
        groupCode: groupCode.trim()
      }, {
        headers: getAuthHeaders()
      });

      if (response.data) {
        setShowJoinGroupDialog(false);
        setGroupCode('');
        fetchGroups();
        setError('Successfully joined the group!');
      }
    } catch (error) {
      console.error('Error joining group:', error);
      setError(error.response?.data?.error || 'Failed to join group');
    }
  };

  // Add a new useEffect to maintain selected states
  useEffect(() => {
    const storedSelectedFriend = localStorage.getItem('selectedFriend');
    const storedSelectedGroup = localStorage.getItem('selectedGroup');
    
    if (storedSelectedFriend) {
      setSelectedFriend(JSON.parse(storedSelectedFriend));
    }
    if (storedSelectedGroup) {
      setSelectedGroup(JSON.parse(storedSelectedGroup));
    }
  }, []);

  const FriendRequestsModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg w-96">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Friend Requests</h2>
          <button
            onClick={() => setShowFriendRequestsModal(false)}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <p className="text-gray-400 text-center">No pending friend requests</p>
          ) : (
            pendingRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                <span className="text-white">{request.username}</span>
                <button
                  onClick={() => handleAcceptRequest(request.id)}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Accept
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar - Hidden on mobile, visible on larger screens */}
      <div className="hidden md:flex w-72 p-4 border-r border-gray-800 bg-gray-900 flex-col">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-blue-400">Chat App</h1>
          <p className="text-sm text-gray-400">Welcome, {user?.username}</p>
        </div>
        
        <div className="space-y-3 mb-6">
          <button
            onClick={() => setShowFriendsModal(true)}
            className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 flex items-center justify-center space-x-2 transition-colors"
          >
            <span>👤</span>
            <span>Friends</span>
          </button>
          <button
            onClick={() => setShowGroupsModal(true)}
            className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-green-400 flex items-center justify-center space-x-2 transition-colors"
          >
            <span>👥</span>
            <span>Groups</span>
          </button>
          <button
            onClick={() => setShowAddFriendDialog(true)}
            className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 flex items-center justify-center space-x-2 transition-colors"
          >
            <span>+</span>
            <span>Add Friend</span>
          </button>
          <button
            onClick={() => setShowCreateGroupDialog(true)}
            className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-green-400 flex items-center justify-center space-x-2 transition-colors"
          >
            <span>+</span>
            <span>Create Group</span>
          </button>
          <button
            onClick={() => setShowJoinGroupDialog(true)}
            className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-purple-400 flex items-center justify-center space-x-2 transition-colors"
          >
            <span>+</span>
            <span>Join Group</span>
          </button>
        </div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Friends</h2>
          <button
            onClick={() => setShowFriendRequestsModal(true)}
            className="relative p-2 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {pendingRequests.length > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
        {/* Add Logout Button */}
        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="w-full p-3 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center space-x-2 transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col w-full">
        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-400">Chat App</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="md:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setShowMobileMenu(false)}>
            <div className="absolute right-0 top-0 h-full w-64 bg-gray-900 p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-blue-400">Menu</h2>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => { setShowFriendsModal(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>👤</span>
                  <span>Friends</span>
                </button>
                <button
                  onClick={() => { setShowGroupsModal(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-green-400 flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>👥</span>
                  <span>Groups</span>
                </button>
                <button
                  onClick={() => { setShowAddFriendDialog(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>+</span>
                  <span>Add Friend</span>
                </button>
                <button
                  onClick={() => { setShowCreateGroupDialog(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-green-400 flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>+</span>
                  <span>Create Group</span>
                </button>
                <button
                  onClick={() => { setShowJoinGroupDialog(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-purple-400 flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>+</span>
                  <span>Join Group</span>
                </button>
                <button
                  onClick={() => { setShowFriendRequestsModal(true); setShowMobileMenu(false); }}
                  className="w-full p-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 flex items-center justify-center space-x-2 transition-colors relative"
                >
                  <span>🔔</span>
                  <span>Friend Requests</span>
                  {pendingRequests.length > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
                {/* Add Logout Button to Mobile Menu */}
                <button
                  onClick={handleLogout}
                  className="w-full p-3 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center space-x-2 transition-colors"
                >
                  <span>🚪</span>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Content */}
        {selectedFriend || selectedGroup ? (
          <>
            <div className="p-4 border-b border-gray-800 bg-gray-900">
              <h2 className="text-xl font-semibold text-blue-400">
                {selectedFriend ? `Chat with ${selectedFriend.username}` : `Group: ${selectedGroup.name}`}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.isSent ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.isSent
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-white'
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className="text-xs mt-1 opacity-75">
                      {message.isSent ? 'You' : message.sender_username} • {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-800 bg-gray-900">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-900">
            <div className="text-center p-4">
              <h2 className="text-2xl font-bold text-blue-400 mb-2">Welcome to Chat App</h2>
              <p className="text-gray-400">Select a friend or group to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Friends Modal */}
      {showFriendsModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowFriendsModal(false)}
        >
          <div 
            className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-blue-400">Friends</h2>
              <button
                onClick={() => setShowFriendsModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {friends.map(friend => (
                <div
                  key={friend.id}
                  onClick={() => { handleSelectFriend(friend); setShowFriendsModal(false); }}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedFriend?.id === friend.id
                      ? 'bg-blue-900/50 border border-blue-500'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>{friend.username}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Groups Modal */}
      {showGroupsModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowGroupsModal(false)}
        >
          <div 
            className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-green-400">Groups</h2>
              <button
                onClick={() => setShowGroupsModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {groups.map(group => (
                <div
                  key={group.id}
                  onClick={() => { handleSelectGroup(group); setShowGroupsModal(false); }}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedGroup?.id === group.id
                      ? 'bg-green-900/50 border border-green-500'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>{group.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Friend Dialog */}
      {showAddFriendDialog && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAddFriendDialog(false)}
        >
          <div 
            className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-blue-400 mb-4">Add Friend</h2>
            <input
              type="text"
              value={friendUsername}
              onChange={(e) => setFriendUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowAddFriendDialog(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFriend}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Dialog */}
      {showCreateGroupDialog && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreateGroupDialog(false)}
        >
          <div 
            className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-blue-400 mb-4">Create Group</h2>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCreateGroupDialog(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Group Dialog */}
      {showJoinGroupDialog && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowJoinGroupDialog(false)}
        >
          <div 
            className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-blue-400 mb-4">Join Group</h2>
            <input
              type="text"
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="Enter group code"
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowJoinGroupDialog(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJoinGroup}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}

      {showFriendRequestsModal && <FriendRequestsModal />}

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Chat; 