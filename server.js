const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let activeSession = {
    active: false,
    lectureName: '',
    endTime: null,
    lat: 0,
    lng: 0,
    radius: 50,
    attendedStudents: []
};

let bannedDevices = new Set();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

io.on('connection', (socket) => {
    socket.emit('sessionStatus', activeSession);

    socket.on('startSession', (data) => {
        activeSession = {
            active: true,
            lectureName: data.lectureName,
            endTime: Date.now() + (data.durationMinutes * 60 * 1000),
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lng),
            radius: parseFloat(data.radius),
            attendedStudents: []
        };
        io.emit('sessionStarted', activeSession);
    });

    socket.on('stopSession', () => {
        activeSession.active = false;
        io.emit('sessionStopped');
    });

    // الإضافة اليدوية من الأدمن
    socket.on('manualAddStudent', (data) => {
        const record = {
            studentName: data.studentName,
            studentCode: data.studentCode,
            time: new Date().toLocaleTimeString('ar-EG'),
            distance: 0,
            deviceId: 'MANUAL'
        };
        activeSession.attendedStudents.push(record);
        io.emit('newStudentAttended', record);
    });

    socket.on('unbanDevice', (val) => {
        bannedDevices.delete(val);
        activeSession.attendedStudents = activeSession.attendedStudents.filter(s => s.studentCode !== val && s.deviceId !== val);
    });

    socket.on('submitAttendance', (student, callback) => {
        if (!activeSession.active || Date.now() > activeSession.endTime) {
            return callback({ success: false, message: 'الجلسة مغلقة حالياً!' });
        }

        if (bannedDevices.has(student.deviceId) || bannedDevices.has(student.studentCode)) {
            return callback({ success: false, message: 'عذراً، هذا الجهاز/الكود محظور من التسجيل!' });
        }

        const distance = getDistance(student.lat, student.lng, activeSession.lat, activeSession.lng);
        if (distance > activeSession.radius) {
            return callback({ success: false, message: `أنت خارج القاعة! المسافة: ${distance} متر (المسموح: ${activeSession.radius}m)` });
        }

        const alreadyAttended = activeSession.attendedStudents.some(s => s.studentCode === student.studentCode || s.deviceId === student.deviceId);
        if (alreadyAttended) {
            return callback({ success: false, message: 'تم تسجيل الحضور مسبقاً لهذا الطالب أو من هذا الهاتف!' });
        }

        const record = {
            studentName: student.studentName,
            studentCode: student.studentCode,
            time: new Date().toLocaleTimeString('ar-EG'),
            distance: distance,
            deviceId: student.deviceId
        };

        activeSession.attendedStudents.push(record);
        io.emit('newStudentAttended', record);
        callback({ success: true, message: 'تم تسجيل حضورك بنجاح! 🎯' });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على: http://localhost:${PORT}`);
});