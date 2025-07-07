import { io } from 'socket.io-client';

const URL = "http://localhost:3001"; // Or your backend URL
export const socket = io(URL, { autoConnect: false });
