import fs, { exists } from 'fs';
import jwt from 'jsonwebtoken';
import AsyncLock from 'async-lock';
import { InputError, AccessError, } from './error.js';

import {
  quizQuestionPublicReturn,
  quizQuestionGetCorrectAnswers,
  quizQuestionGetDuration,
} from './custom.js';

const lock = new AsyncLock();

const JWT_SECRET = 'llamallamaduck';
const DATABASE_FILE = './database.json';

/***************************************************************
                       State Management
***************************************************************/

let admins = {};
let quizzes = {};
let sessions = {};
let courses = {};
let topicGroups = {};
let shopItems = [
  {
    "name": "Small Booster (x2)",
    "code": "smallBooster",
    "type": "Booster",
    "desc": "Earn 2x Points on level completion",
    "sellingFast": true,
    "quantity": 2598,
    "duration": 10,
    "cost": 20000
  },
  {
    "name": "Medium Booster (x4)",
    "code": "mediumBooster",
    "type": "Booster",
    "desc": "Earn 4x Points on level completion",
    "sellingFast": true,
    "quantity": 863,
    "duration": 15,
    "cost": 35000
  },
  {
    "name": "Complete a Challenge",
    "type": "Completion",
    "desc": "Use this to complete level!",
    "sellingFast": true,
    "quantity": 20,
    "duration": "Single Use",
    "cost": 80000
  }
];



const sessionTimeouts = {};

const update = (admins, courses, quizzes, sessions) =>
  new Promise((resolve, reject) => {
    lock.acquire('saveData', () => {
      try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify({
          admins,
          courses,
          quizzes,
          sessions,
          shopItems,
        }, null, 2));
        resolve();
      } catch {
        reject(new Error('Writing to database failed'));
      }
    });
  });

export const save = () => update(admins, courses, quizzes, sessions);
export const reset = () => {
  update({}, {}, {});
  admins = {};
  courses = {};
  quizzes = {};
  sessions = {};
  shopItems = shopItems;
};

try {
  const data = JSON.parse(fs.readFileSync(DATABASE_FILE));
  admins = data.admins;
  courses = data.courses;
  quizzes = data.quizzes;
  sessions = data.sessions;
  shopItems = data.shopItems;
} catch {
  
  save();
}

/***************************************************************
                       Helper Functions
***************************************************************/

const newSessionId = _ => generateId(Object.keys(sessions), 999999);
const newQuizId = _ => generateId(Object.keys(quizzes));
const newCourseId = _ => generateId(Object.keys(courses), 99999999);
const newPlayerId = (sessionId) => generateId(sessions[sessionId].players);

export const userLock = callback => new Promise((resolve, reject) => {
  lock.acquire('userAuthLock', callback(resolve, reject));
});

export const quizLock = callback => new Promise((resolve, reject) => {
  lock.acquire('quizMutateLock', callback(resolve, reject));
});

export const courseLock = callback => new Promise((resolve, reject) => {
  lock.acquire('courseMutateLock', callback(resolve, reject));
});

export const sessionLock = callback => new Promise((resolve, reject) => {
  lock.acquire('sessionMutateLock', callback(resolve, reject));
});

const copy = x => JSON.parse(JSON.stringify(x));
const randNum = max => Math.round(Math.random() * (max - Math.floor(max / 10)) + Math.floor(max / 10));
const generateId = (currentList, max = 999999999) => {
  console.log(currentList);
  let R = randNum(max);
  if (Object.keys(currentList).length != 0 ) {
    while (currentList.includes(R)) {
      R = randNum(max);
    }
  }
  
  return R.toString();
};

/***************************************************************
                       Auth Functions
***************************************************************/

export const getEmailFromAuthorization = authorization => {
  try {
    const token = authorization.replace('Bearer ', '');
    const { email, } = jwt.verify(token, JWT_SECRET);
    if (!(email in admins)) {
      throw new AccessError('Invalid Token');
    }
    return email;
  } catch {
    throw new AccessError('Invalid token');
  }
};

export const login = (email, password) => userLock((resolve, reject) => {
  if (email in admins) {
    if (admins[email].password === password) {
      admins[email].sessionActive = true;
      const token = jwt.sign({ email, }, JWT_SECRET, { algorithm: 'HS256', })
      const role = admins[email].role
      const username = admins[email].username
      const points = admins[email].points
      resolve({token, role, username, points});
    }
  }
  reject(new InputError('Invalid username or password'));
});

export const logout = (email) => userLock((resolve, reject) => {
  admins[email].sessionActive = false;
  resolve();
});

export const addPointsToUser = (email, total) => userLock((resolve, reject) => {
  // console.log("In function");
  if (email in admins) {
      const curr = admins[email].points;
      console.log(curr);
      console.log(total);
      admins[email].points = parseInt(curr) + parseInt(total);
      const points = admins[email].points
      resolve({email, points});
  }
  reject(new InputError('Invalid username or password'));
});

export const checkPoints = (email) => userLock((resolve, reject) => {
  // console.log("In function");
  if (email in admins) {
      const curr = admins[email].points;
      resolve({email, curr});
  }
  reject(new InputError('Invalid username or password'));
});

export const register = (email, password, username, role) => userLock((resolve, reject) => {
  if (email in admins) {
    reject(new InputError('Email address already registered!'));
  }
  admins[email] = {
    username,
    password,
    role,
    points: 0,
    sessionActive: true,
    assignedCourses: [],
  };
  const token = jwt.sign({ email, }, JWT_SECRET, { algorithm: 'HS256', });
  resolve({token, role});
});

/***************************************************************
                       Course Functions
***************************************************************/

const newCoursePayload = (courseCode, startDate, endDate, term, year, owner) => ({
  courseCode,
  owner,
  levels: [],
  assignedTo: [],
  startDate,
  endDate,
  term,
  year,
  active: null,
  createdAt: new Date().toISOString(),
});


export const addCourse = (courseCode, startDate, endDate, term, year, owner) => courseLock((resolve, reject) => {
  
  if (courseCode === undefined) {
    reject(new InputError('Must provide a course code for new course'));
  } else {
    const newCourseID = newCourseId();
    courses[newCourseID] = newCoursePayload(courseCode, startDate, endDate, term, year, owner);
    resolve(newCourseID);
  }
});

export const getCoursesOwned = (email) => courseLock((resolve, reject) => {
  
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } else {
    resolve(Object.keys(courses).filter(key => courses[key].owner === email).map(key => ({
      id: parseInt(key, 10),
      createdAt: courses[key].createdAt,
      courseCode: courses[key].courseCode,
      levels: courses[key].levels,
      startDate: courses[key].startDate,
      endDate: courses[key].endDate,
      owner: courses[key].ownerF,
      active: courses[key].active,
      term: courses[key].term,
      year: courses[key].year,
    })));
    
    // resolve(newCourseID);
  }
});

export const getAssignedCourses = (email) => userLock((resolve, reject) => {
  
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } else {
    if (email in admins) {
      resolve(admins[email].assignedCourses);
    } else {
      resolve({});
    }
  }
});

export const getAssignedCoursesWithInfo = (email) => userLock((resolve, reject) => {
  
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } else {
    if (email in admins) {
      var objOfCourses = admins[email].assignedCourses;
      console.log(typeof(objOfCourses));
      var arr = [];
      for (const [key, value] of Object.entries(objOfCourses)) {
        console.log(key);
        console.log(courses[key]);
        courses[key].courseid = key;
        arr.push(courses[key]);
        // course.info = courses[course];
      }
      resolve(arr);
    } else {
      resolve({});
    }
  }
});

export const addLevelToCourse = (courseID, levelID, email) => userLock((resolve, reject) => {
  console.log(levelID);
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } 
  else if (levelID === undefined) {
    reject(new InputError('Must provide an level to add'));
  } 
  else {
    if (courseID in courses) {
      if (!courses[courseID].levels.includes(levelID)){
        courses[courseID].levels.push(levelID);
      }
      // Check Each User and update their assigned course
      // for (var tempUser in admins) {
      //   // Insert course object
      //   if (courseID in tempUser.assignedCourses) {
      //     tempUser.assignedCourses[courseID] = courses[courseID];
      //   }
      //   // for (var assignedCourse in tempUser.assignedCourses) {
      //   //   // let courseExists = Object.values(assignedCourse).includes(courseID);
      //   // }
      // }


      // Go to Quiz.assignedTo and add course.assignedTo
      
      if (!(levelID in quizzes)) {
        reject(new InputError('Invalid quiz ID'));
      } else {
        console.log(courses[courseID].assignedTo)
        courses[courseID].assignedTo.forEach(user => {

          if (!quizzes[levelID].assignedTo.includes(user)) {
            quizzes[levelID].assignedTo.push(user);
          }
        });
      }

      resolve(courses[courseID].levels);
    } else {
      resolve({});
    }
  }
});

export const removeLevelFromCourse = (courseID, levelID, email) => userLock((resolve, reject) => {
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } else {
    if (courseID in courses) {
      if (courses[courseID].levels.includes(levelID)){
        courses[courseID].levels = courses[courseID].levels.filter(item => item !== levelID);
      }
      // Go to Quiz.assignedTo and add course.assignedTo
      if (!(levelID in quizzes)) {
        reject(new InputError('Invalid quiz ID'));
      } else {
        console.log(courses[courseID].assignedTo)
        courses[courseID].assignedTo.forEach(user => {
          if (quizzes[levelID].assignedTo.includes(user)) {
            quizzes[levelID].assignedTo = quizzes[levelID].assignedTo.filter(item => item !== user);
          }
        });
      }

      resolve(courses[courseID].levels);
    } else {
      resolve({});
    }
  }
});








/***************************************************************
                       Shop Functions
***************************************************************/
// Get Items from Shop
export const getShopItems = (email) => userLock((resolve, reject) => {
  
  if (email === undefined) {
    reject(new InputError('Must provide an owner email to query'));
  } else {
    if (email in admins) {
      resolve(shopItems);
    } else {
      resolve({});
    }
  }
});




/***************************************************************
                       Quiz Functions
***************************************************************/

const newQuizPayload = (name, owner) => ({
  name,
  owner,
  assignedTo: [],
  questions: [],
  thumbnail: null,
  week: 0,
  levelType: '',
  levelFormat: '',
  active: null,
  createdAt: new Date().toISOString(),
});

export const assertOwnsQuiz = (email, quizId) => quizLock((resolve, reject) => {
  if (!(quizId in quizzes)) {
    reject(new InputError('Invalid quiz ID'));
  } else if (quizzes[quizId].owner !== email) {
    reject(new InputError('Admin does not own this Quiz'));
  } else {
    resolve();
  }
});

export const getQuizzesFromAdmin = () => quizLock((resolve, reject) => {
  // .filter(key => quizzes[key].owner === email)
  resolve(Object.keys(quizzes).map(key => ({
    id: parseInt(key, 10),
    createdAt: quizzes[key].createdAt,
    name: quizzes[key].name,
    thumbnail: quizzes[key].thumbnail,
    week: quizzes[key].week,
    levelType: quizzes[key].levelType,
    owner: quizzes[key].owner,
    active: getActiveSessionIdFromQuizId(key),
    oldSessions: getInactiveSessionsIdFromQuizId(key),
  })));
});

export const addQuiz = (name, email) => quizLock((resolve, reject) => {
  
  if (name === undefined) {
    reject(new InputError('Must provide a name for new quiz'));
  } else {
    const newId = newQuizId();
    console.log(newId)
    quizzes[newId] = newQuizPayload(name, email);
    
    resolve(newId);
  }
});

export const getQuiz = quizId => quizLock((resolve, reject) => {
  resolve({
    ...quizzes[quizId],
    active: getActiveSessionIdFromQuizId(quizId),
    oldSessions: getInactiveSessionsIdFromQuizId(quizId),
  });
});

export const updateQuiz = (quizId, questions, name, thumbnail, week, levelType, levelFormat) => quizLock((resolve, reject) => {
  if (questions) {
    quizzes[quizId].questions = questions;
  }
  if (name) { quizzes[quizId].name = name; }
  if (thumbnail) { quizzes[quizId].thumbnail = thumbnail; }
  if (week) { quizzes[quizId].week = week; }
  if (levelType) { quizzes[quizId].levelType = levelType; }
  if (levelFormat) { quizzes[quizId].levelFormat = levelFormat; }  
  resolve();
});

export const removeQuiz = quizId => quizLock((resolve, reject) => {
  delete quizzes[quizId];
  resolve();
});

export const startQuiz = quizId => quizLock((resolve, reject) => {
  if (quizHasActiveSession(quizId)) {
    reject(new InputError('Quiz already has active session'));
  } else {
    const id = newSessionId();
    sessions[id] = newSessionPayload(quizId);
    resolve(id);
  }
});

export const advanceQuiz = quizId => quizLock((resolve, reject) => {
  const session = getActiveSessionFromQuizIdThrow(quizId);
  if (!session.active) {
    reject(new InputError('Cannot advance a quiz that is not active'));
  } else {
    const totalQuestions = session.questions.length;
    session.position += 1;
    session.answerAvailable = false;
    session.isoTimeLastQuestionStarted = new Date().toISOString();
    if (session.position >= totalQuestions) {
      endQuiz(quizId);
    } else {
      const questionDuration = quizQuestionGetDuration(session.questions[session.position]);
      if (sessionTimeouts[session.id]) {
        clearTimeout(sessionTimeouts[session.id]);
      }
      sessionTimeouts[session.id] = setTimeout(() => {
        session.answerAvailable = true;
      }, questionDuration * 1000);
    }
    resolve(session.position);
  }
});

export const endQuiz = quizId => quizLock((resolve, reject) => {
  const session = getActiveSessionFromQuizIdThrow(quizId);
  session.active = false;
  resolve();
});

/***************************************************************
                       Session Functions
***************************************************************/

const quizHasActiveSession = quizId => Object.keys(sessions).filter(s => sessions[s].quizId === quizId && sessions[s].active).length > 0;

const getActiveSessionFromQuizIdThrow = quizId => {
  if (!quizHasActiveSession(quizId)) {
    throw new InputError('Quiz has no active session');
  }
  const sessionId = getActiveSessionIdFromQuizId(quizId);
  if (sessionId !== null) {
    return sessions[sessionId];
  }
  return null;
};

const getActiveSessionIdFromQuizId = quizId => {
  const activeSessions = Object.keys(sessions).filter(s => sessions[s].quizId === quizId && sessions[s].active);
  if (activeSessions.length === 1) {
    return parseInt(activeSessions[0], 10);
  }
  return null;
};

const getInactiveSessionsIdFromQuizId = quizId =>
  Object.keys(sessions).filter(sid => sessions[sid].quizId === quizId && !sessions[sid].active).map(s => parseInt(s, 10));

const getActiveSessionFromSessionId = sessionId => {
  if (sessionId in sessions) {
    if (sessions[sessionId].active) {
      return sessions[sessionId];
    }
  }
  throw new InputError('Session ID is not an active session');
};

const sessionIdFromPlayerId = playerId => {
  for (const sessionId of Object.keys(sessions)) {
    if (Object.keys(sessions[sessionId].players).filter(p => p === playerId).length > 0) {
      return sessionId;
    }
  }
  throw new InputError('Player ID does not refer to valid player id');
};

const newSessionPayload = quizId => ({
  quizId,
  position: -1,
  isoTimeLastQuestionStarted: null,
  players: {},
  questions: copy(quizzes[quizId].questions),
  active: true,
  answerAvailable: false,
});

const newPlayerPayload = (name, numQuestions) => ({
  name: name,
  pointsEarned: 0,
  answers: Array(numQuestions).fill({
    questionStartedAt: null,
    answeredAt: null,
    answerIds: [],
    correct: false,
  }),
});

export const sessionStatus = sessionId => {
  const session = sessions[sessionId];
  return {
    active: session.active,
    answerAvailable: session.answerAvailable,
    isoTimeLastQuestionStarted: session.isoTimeLastQuestionStarted,
    position: session.position,
    questions: session.questions,
    players: Object.keys(session.players).map(player => session.players[player].name),
  };
};

export const assertOwnsSession = async (email, sessionId) => {
  await assertOwnsQuiz(email, sessions[sessionId].quizId);
};

export const sessionResults = sessionId => sessionLock((resolve, reject) => {
  const session = sessions[sessionId];
  if (session.active) {
    reject(new InputError('Cannot get results for active session'));
  } else {
    resolve(Object.keys(session.players).map(pid => session.players[pid]));
  }
});

export const playerJoin = (name, sessionId) => sessionLock((resolve, reject) => {
  console.log(name);
  console.log(sessionId);
  
  if (name === undefined) {
    console.log("name must be supplied");
    reject(new InputError('Name must be supplied'));
  } else {
    console.log("else");
    const session = getActiveSessionFromSessionId(sessionId);
    console.log("Active Session: " + session);
    if (session.position > 0) {
      reject(new InputError('Session has already begun'));
    } else {
      console.log("create new player");
      const id = newPlayerId(sessionId);
      console.log(id);
      session.players[id] = newPlayerPayload(name, session.questions.length);
      console.log(session.players[id]);
      resolve(parseInt(id, 10));
    }
  }
});

export const hasStarted = playerId => sessionLock((resolve, reject) => {
  const session = getActiveSessionFromSessionId(sessionIdFromPlayerId(playerId));
  if (session.isoTimeLastQuestionStarted !== null) {
    resolve(true);
  } else {
    resolve(false);
  }
});

export const getQuestion = playerId => sessionLock((resolve, reject) => {
  const session = getActiveSessionFromSessionId(sessionIdFromPlayerId(playerId));
  if (session.position === -1) {
    reject(new InputError('Session has not started yet'));
  } else {
    resolve({
      ...quizQuestionPublicReturn(session.questions[session.position]),
      isoTimeLastQuestionStarted: session.isoTimeLastQuestionStarted,
    });
  }
});

export const getAnswers = playerId => sessionLock((resolve, reject) => {
  const session = getActiveSessionFromSessionId(sessionIdFromPlayerId(playerId));
  if (session.position === -1) {
    reject(new InputError('Session has not started yet'));
  } else if (!session.answerAvailable) {
    reject(new InputError('Question time has not been completed'));
  } else {
    resolve(quizQuestionGetCorrectAnswers(session.questions[session.position]));
  }
});

export const submitAnswers = (playerId, answerList) => sessionLock((resolve, reject) => {
  if (answerList === undefined || answerList.length === 0) {
    reject(new InputError('Answers must be provided'));
  } else {
    const session = getActiveSessionFromSessionId(sessionIdFromPlayerId(playerId));
    if (session.position === -1) {
      reject(new InputError('Session has not started yet'));
    } else if (session.answerAvailable) {
      reject(new InputError('Can\'t answer question once answer is available'));
    } else {
      let correctCheck = JSON.stringify(quizQuestionGetCorrectAnswers(session.questions[session.position]).sort()) === JSON.stringify(answerList.sort());
      let pointsEarned = 0;
      if (correctCheck === true) {
        pointsEarned = session.questions[session.position].points;
        console.log("Correct");
      } else {
        pointsEarned = 0;
        console.log("Not Correct");
      }
      console.log(pointsEarned);
      session.players[playerId].answers[session.position] = {
        questionStartedAt: session.isoTimeLastQuestionStarted,
        answeredAt: new Date().toISOString(),
        answerIds: answerList,
        pointsEarned: pointsEarned,
        correct: JSON.stringify(quizQuestionGetCorrectAnswers(session.questions[session.position]).sort()) === JSON.stringify(answerList.sort()),
      };

      

      // 
      // 
      resolve();
    }
  }
});

export const getResults = playerId => sessionLock((resolve, reject) => {
  const session = sessions[sessionIdFromPlayerId(playerId)];
  if (session.active) {
    reject(new InputError('Session is ongoing, cannot get results yet'));
  } else if (session.position === -1) {
    reject(new InputError('Session has not started yet'));
  } else {
    resolve(session.players[playerId].answers);
  }
});
