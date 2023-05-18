"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTime = void 0;
function formatTime(time) {
    return time < 10 ? `0${time}` : `${time}`;
}
function setupTime(time) {
    let hours = time.hours || 0;
    let minutes = time.minutes || 0;
    let seconds = time.seconds || 0;
    seconds++;
    if (seconds === 60) {
        seconds = 0;
        minutes++;
        if (minutes === 60) {
            minutes = 0;
            hours++;
        }
    }
    const formatted = `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
    return {
        seconds,
        minutes,
        hours,
        formatted
    };
}
exports.setupTime = setupTime;
