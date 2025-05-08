# Chatfrica - Real-Time Chat Application Individual project

## Description
This is the individual project I made for the midterm I implemented winston for login.
## Features
- User Authentication (Registration & Login)
- Friend Management (Send/Accept/Reject Requests)
- Private Messaging
- Group Chat Creation & Management
- Real-time Notifications
- Responsive Design (Desktop & Mobile)
- Dark Mode Theme
- Message History
- Online/Offline Status

## Technologies Used

### Frontend
- React.js (JavaScript library for building user interfaces)
- Material-UI (UI component library)
- Socket.io-client (Real-time communication)
- Axios (HTTP client)
- JWT-decode (JWT token handling)
- HTML5 & CSS3
- JavaScript (ES6+)

### Backend
- Node.js (Runtime environment)
- Express.js (Web framework)
- Socket.io (Real-time communication)
- PostgreSQL (Relational database)
- JWT (Authentication)
- Bcrypt (Password hashing)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/check-session` - Check user session

### Friends
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept` - Accept friend request
- `GET /api/friends/:userId` - Get user's friends
- `GET /api/friends/pending/:userId` - Get pending friend requests

### Groups
- `POST /api/groups` - Create new group
- `GET /api/groups/:userId` - Get user's groups
- `POST /api/groups/join` - Join group using code
- `GET /api/groups/:groupId/members` - Get group members

### Messages
- `GET /api/messages/private/:userId/:friendId` - Get private messages
- `GET /api/messages/group/:groupId` - Get group messages
- `POST /api/messages/private` - Send private message
- `POST /api/messages/group` - Send group message

### WebSocket Events
- `private message` - Receive private message
- `group message` - Receive group message
- `friend_request` - Receive friend request
- `friend_accepted` - Friend request accepted
- `join` - Join chat room
- `leave` - Leave chat room

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd chat-app
```

2. Install dependencies:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

3. Set up the database:
- Create a PostgreSQL database
- Update the `.env` file with your database credentials
- Run the database initialization script

4. Start the application:
```bash
# Start the server
cd server
npm start

# Start the client
cd ../client
npm start
```

## Environment Variables

Create a `.env` file in the server directory with the following variables:

```
DB_USER=your_db_user
DB_HOST=localhost
DB_NAME=your_db_name
DB_PASSWORD=your_db_password
DB_PORT=5432
JWT_SECRET=your_jwt_secret
PORT=5000
NODE_ENV=development
```

## Usage

1. Register a new account or log in with existing credentials
2. Add friends by sending friend requests
3. Create or join groups using invite codes
4. Start chatting with friends or in groups
5. Receive real-time notifications for new messages and friend requests

## Security Features

- Password hashing using bcrypt
- JWT-based authentication
- Secure WebSocket connections
- Input validation and sanitization
- Protected API routes
- Session management

## License

This project is licensed under the MIT License - see the LICENSE file for details.
