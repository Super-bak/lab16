const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { query } = require('./config/db');
require('dotenv').config();
const winston = require('winston');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.io configuration
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e8
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Register new user
app.post('/api/register', async (req, res) => {
  try {
    winston.log('Registration attempt:', req.body.username);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    winston.log('Password hashed successfully');

    const result = await query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
      [username, hashedPassword]
    );
    winston.log('User created successfully:', result.rows[0].id);

    const token = jwt.sign({ id: result.rows[0].id, username }, process.env.JWT_SECRET);
    winston.log('JWT token generated');
    res.json({ token });
  } catch (error) {
    winston.error('Registration error:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username already exists' });
    } else if (error.code === '28P01') { // Invalid password
      res.status(500).json({ error: 'Database authentication failed' });
    } else if (error.code === '3D000') { // Database does not exist
      res.status(500).json({ error: 'Database does not exist' });
    } else {
      res.status(500).json({ error: 'Registration failed', details: error.message });
    }
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  try {
    winston.log('Login attempt:', req.body.username);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    winston.log('User query result:', result.rows.length ? 'User found' : 'User not found');

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    winston.log('Password validation:', validPassword ? 'Valid' : 'Invalid');

    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET);
    winston.log('Login successful, token generated');
    res.json({ token });
  } catch (error) {
    winston.error('Login error:', error);
    if (error.code === '28P01') { // Invalid password
      res.status(500).json({ error: 'Database authentication failed' });
    } else if (error.code === '3D000') { // Database does not exist
      res.status(500).json({ error: 'Database does not exist' });
    } else {
      res.status(500).json({ error: 'Login failed', details: error.message });
    }
  }
});

// Get user's friends
app.get('/api/friends/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await query(`
      SELECT u.id, u.username 
      FROM users u
      JOIN friends f ON (f.friend_id = u.id AND f.user_id = $1) OR (f.user_id = u.id AND f.friend_id = $1)
      WHERE f.status = 'accepted'
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    winston.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Error fetching friends' });
  }
});

// Send friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    winston.log('Friend request received:', req.body);
    const { userId, friendUsername } = req.body;
    
    if (!userId || !friendUsername) {
      return res.status(400).json({ error: 'User ID and friend username are required' });
    }

    // Get friend's ID
    const friendResult = await query('SELECT id FROM users WHERE username = $1', [friendUsername]);
    if (friendResult.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }
    const friendId = friendResult.rows[0].id;

    // Check if friendship already exists
    const existingResult = await query(
      'SELECT * FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userId, friendId]
    );

    if (existingResult.rows.length > 0) {
      const existingStatus = existingResult.rows[0].status;
      if (existingStatus === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      } else if (existingStatus === 'pending') {
        return res.status(400).json({ error: 'Friend request already pending' });
      }
    }

    // Create friend request
    const result = await query(
      'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3) RETURNING *',
      [userId, friendId, 'pending']
    );

    winston.log('Friend request created:', result.rows[0]);

    // Emit friend request event
    io.to(friendId.toString()).emit('friend_request', {
      from: userId,
      username: req.user.username
    });

    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    winston.error('Error in friend request:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Friend request already exists' });
    } else if (error.code === '23503') { // Foreign key violation
      res.status(400).json({ error: 'Invalid user ID' });
    } else {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
});

// Get pending friend requests
app.get('/api/friends/pending/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await query(`
      SELECT u.id, u.username, f.created_at
      FROM users u
      JOIN friends f ON f.user_id = u.id
      WHERE f.friend_id = $1 AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    winston.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Error fetching pending requests' });
  }
});

// Accept friend request
app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    
    // Update the friend request status
    const result = await query(
      `UPDATE friends 
       SET status = 'accepted' 
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING *`,
      [friendId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No pending friend request found' });
    }

    // Emit friend accepted event
    io.to(userId.toString()).emit('friend_accepted', { 
      friendId,
      username: req.user.username 
    });
    io.to(friendId.toString()).emit('friend_accepted', { 
      friendId: userId,
      username: req.user.username 
    });

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    winston.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Error accepting friend request' });
  }
});

// Get group messages
app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const result = await query(`
      SELECT m.*, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.group_id = $1
      ORDER BY m.created_at ASC
    `, [groupId]);
    res.json(result.rows);
  } catch (error) {
    winston.error('Error fetching group messages:', error);
    res.status(500).json({ error: 'Error fetching group messages' });
  }
});

// Get messages between two users
app.get('/api/messages/:userId/:friendId', authenticateToken, async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    const result = await query(`
      SELECT m.*, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
      OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
    `, [userId, friendId]);
    res.json(result.rows);
  } catch (error) {
    winston.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// Create group
app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const { name, createdBy } = req.body;
    
    // Generate a unique code for the group
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create the group
    const result = await query(
      `INSERT INTO groups (name, code, created_by) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [name, code, createdBy]
    );

    // Add creator as a member
    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [result.rows[0].id, createdBy]
    );

    res.json({ 
      message: 'Group created successfully',
      group: result.rows[0]
    });
  } catch (error) {
    winston.error('Error creating group:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Group name already exists' });
    } else {
      res.status(500).json({ error: 'Error creating group' });
    }
  }
});

// Get user's groups
app.get('/api/groups/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await query(`
      SELECT g.*, u.username as creator_username
      FROM groups g
      JOIN users u ON g.created_by = u.id
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
      ORDER BY g.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    winston.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Error fetching groups' });
  }
});

// Join group
app.post('/api/groups/join', authenticateToken, async (req, res) => {
  try {
    const { userId, groupCode } = req.body;
    
    // Find group by code
    const groupResult = await query(
      'SELECT id FROM groups WHERE code = $1',
      [groupCode]
    );

    if (groupResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid group code' });
    }

    const groupId = groupResult.rows[0].id;

    // Check if user is already a member
    const memberResult = await query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    if (memberResult.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    // Add user to group
    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [groupId, userId]
    );

    res.json({ message: 'Successfully joined group' });
  } catch (error) {
    winston.error('Error joining group:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Already a member of this group' });
    } else {
      res.status(500).json({ error: 'Error joining group' });
    }
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  winston.log('New client connected:', socket.id);
  
  socket.on('join', (userId) => {
    winston.info('User joined:', { userId });
    socket.join(userId.toString());
    socket.emit('connected', { message: 'Successfully connected to server' });
  });

  socket.on('private message', async (data) => {
    winston.log('Received private message from socket:', data);
    const { senderId, receiverId, content, timestamp } = data;
    
    try {
      // Save message to database
      const result = await query(
        'INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [senderId, receiverId, content, timestamp]
      );
      
      // Get sender's username
      const userResult = await query('SELECT username FROM users WHERE id = $1', [senderId]);
      const user = userResult.rows[0];
      
      const message = {
        senderId,
        receiverId,
        content,
        timestamp,
        sender_username: user.username,
        id: result.rows[0].id
      };
      
      // Emit to both sender and receiver
      io.to(senderId.toString()).emit('private message', message);
      io.to(receiverId.toString()).emit('private message', message);
    } catch (error) {
      winston.error('Error handling private message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('group message', async (data) => {
    winston.info('Received group message from socket:', data);
    const { senderId, groupId, content, timestamp } = data;
    
    try {
      // Save message to database
      const result = await query(
        'INSERT INTO messages (sender_id, group_id, content, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [senderId, groupId, content, timestamp]
      );
      
      // Get sender's username
      const userResult = await query('SELECT username FROM users WHERE id = $1', [senderId]);
      const user = userResult.rows[0];
      
      const message = {
        senderId,
        groupId,
        content,
        timestamp,
        sender_username: user.username,
        id: result.rows[0].id
      };
      
      // Get all group members
      const membersResult = await query(
        'SELECT user_id FROM group_members WHERE group_id = $1',
        [groupId]
      );
      
      // Emit to all group members
      membersResult.rows.forEach(member => {
        io.to(member.user_id.toString()).emit('group message', message);
      });
    } catch (error) {
      winston.error('Error handling group message:', error);
      socket.emit('error', { message: 'Failed to send group message' });
    }
  });

  socket.on('error', (error) => {
    winston.error('Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    winston.log('Client disconnected:', socket.id, 'Reason:', reason);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  winston.log(`Server running on port ${PORT}`);
}); 