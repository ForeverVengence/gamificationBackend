import fs from 'fs';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import bodyParser from 'body-parser';
import cors from 'cors';

import { InputError, AccessError, } from './error.js';
// import swaggerDocument from '../../swagger.json';
import {
  getEmailFromAuthorization,
  login,
  logout,
  register,
  save,
  getQuizzesFromAdmin,
  addQuiz,
  startQuiz,
  endQuiz,
  submitAnswers,
  getResults,
  assertOwnsQuiz,
  getQuiz,
  playerJoin,
  updateQuiz,
  sessionStatus,
  assertOwnsSession,
  removeQuiz,
  sessionResults,
  advanceQuiz,
  getQuestion,
  getAnswers,
  hasStarted,
  addCourse,
  addPointsToUser,
  checkPoints,
  getCoursesOwned,
  getAssignedCourses,
  addLevelToCourse,
  removeLevelFromCourse,
  getShopItems,
  getAssignedCoursesWithInfo,
} from './service.js';

import volleyball from 'volleyball';

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true, }));
app.use(bodyParser.json({ limit: '50mb', }));

app.use(volleyball);

const catchErrors = fn => async (req, res) => {
  try {
    await fn(req, res);
    save();
  } catch (err) {
    if (err instanceof InputError) {
      res.status(400).send({ error: err.message, });
    } else if (err instanceof AccessError) {
      res.status(403).send({ error: err.message, });
    } else {
      res.status(500).send({ error: 'A system error ocurred', });
    }
  }
};

/***************************************************************
                       Auth Functions
***************************************************************/

const authed = fn => async (req, res) => {
  const email = getEmailFromAuthorization(req.header('Authorization'));
  await fn(req, res, email);
};

app.post('/admin/auth/login', catchErrors(async (req, res) => {
  const { email, password, } = req.body;
  const response = await login(email, password);
  console.log(response);
  return res.json(response);
}));

app.post('/admin/auth/register', catchErrors(async (req, res) => {
  const { email, password, username, permission, } = req.body;
  const response = await register(email, password, username, permission);
  console.log(response);
  return res.json(response);
}));

app.post('/admin/auth/logout', catchErrors(authed(async (req, res, email) => {
  await logout(email);
  return res.json({});
})));

app.post('/admin/auth/addPoints', catchErrors(authed(async (req, res) => {
  const { email, total } = req.body;
  console.log(total);
  const response = await addPointsToUser(email, total);
  console.log(response);
  return res.json(response);
})));

app.post('/admin/auth/checkPoints', catchErrors(authed(async (req, res) => {
  const { email } = req.body;
  const response = await checkPoints(email);
  // console.log(response);
  return res.json(response);
})));


/***************************************************************
                       Course and Functions
***************************************************************/
app.post('/admin/course/new', catchErrors(authed(async (req, res, email) => {
  const courseID = await addCourse (req.body.courseCode, req.body.startDate, req.body.endDate, req.body.term, req.body.year, email);
  return res.json({ courseId: courseID });
})));

app.post('/admin/myCourses', catchErrors(authed(async (req, res, email) => {
  // getCoursesOwned
  const response = await getCoursesOwned (email);
  console.log("All Courses Owned");
  // console.log(response);
  return res.json(response);
})));

// Get Assigned Courses and Levels
app.post('/admin/getAssignedCourses', catchErrors(authed(async (req, res, email) => {
  const coursesData = await getAssignedCourses (email);
  // console.log(coursesData);
  return res.json(coursesData);
})));

// Get Assigned Courses with info
app.post('/admin/getAssignedCoursesWithInfo', catchErrors(authed(async (req, res, email) => {
  const coursesData = await getAssignedCoursesWithInfo (email);
  // console.log(coursesData);
  return res.json(coursesData);
})));

/***************************************************************
                            Levels
***************************************************************/

app.post('/admin/course/addLevel', catchErrors(authed(async (req, res, email) => {
  console.log(req.body.levelID);
  const response = await addLevelToCourse (req.body.courseID, req.body.levelID, email);
  // console.log(coursesData);
  return res.json(response);
})));

app.post('/admin/course/removeLevel', catchErrors(authed(async (req, res, email) => {
  console.log(req.body.levelID);
  const response = await removeLevelFromCourse (req.body.courseID, req.body.levelID, email);
  // console.log(coursesData);
  return res.json(response);
})));

/***************************************************************
                            Shop
***************************************************************/
// Get Shop Items
app.post('/admin/shop/items', catchErrors(authed(async (req, res, email) => {
  const result = await getShopItems (email);
  console.log("Getting Shop Items")
  console.log(result);
  return res.json({ data: result });
})));


/***************************************************************
                       Quiz Functions
***************************************************************/

app.get('/admin/quiz', catchErrors(authed(async (req, res, email) => {
  return res.json({ quizzes: await getQuizzesFromAdmin(), });
})));

app.post('/admin/quiz/new', catchErrors(authed(async (req, res, email) => {
  console.log("In New Quiz");
  return res.json({ quizId: await addQuiz(req.body.name, email) });
})));

app.get('/admin/quiz/:quizid', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  // await assertOwnsQuiz(email, quizid);
  return res.json(await getQuiz(quizid));
})));

app.put('/admin/quiz/:quizid', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  const { questions, name, thumbnail, week, levelType, levelFormat } = req.body;
  await assertOwnsQuiz(email, quizid);
  await updateQuiz(quizid, questions, name, thumbnail, week, levelType, levelFormat);
  return res.status(200).send({});
})));

app.delete('/admin/quiz/:quizid', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  await assertOwnsQuiz(email, quizid);
  await removeQuiz(quizid);
  return res.status(200).send({});
})));

app.post('/admin/quiz/:quizid/start', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  // await assertOwnsQuiz(email, quizid);
  await startQuiz(quizid);
  return res.status(200).json({});
})));

app.post('/admin/quiz/:quizid/advance', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  // await assertOwnsQuiz(email, quizid);
  const stage = await advanceQuiz(quizid);
  return res.status(200).json({ stage, });
})));

app.post('/admin/quiz/:quizid/end', catchErrors(authed(async (req, res, email) => {
  const { quizid, } = req.params;
  // await assertOwnsQuiz(email, quizid);
  await endQuiz(quizid);
  return res.status(200).send({});
})));

app.get('/admin/session/:sessionid/status', catchErrors(authed(async (req, res, email) => {
  const { sessionid, } = req.params;
  // await assertOwnsSession(email, sessionid);
  return res.status(200).json({ results: await sessionStatus(sessionid), });
})));

app.get('/admin/session/:sessionid/results', catchErrors(authed(async (req, res, email) => {
  const { sessionid, } = req.params;
  // await assertOwnsSession(email, sessionid);
  return res.status(200).json({ results: await sessionResults(sessionid), });
})));

/***************************************************************
                       Play Functions
***************************************************************/

app.post('/play/join/:sessionid', catchErrors(async (req, res) => {
  const { sessionid, } = req.params;
  const { name, } = req.body;
  const playerId = await playerJoin(name, sessionid);
  console.log(playerId);
  return res.status(200).send({ playerId, });
}));

app.get('/play/:playerid/status', catchErrors(async (req, res) => {
  const { playerid, } = req.params;
  return res.status(200).send({ started: await hasStarted(playerid), });
}));

app.get('/play/:playerid/question', catchErrors(async (req, res) => {
  const { playerid, } = req.params;
  return res.status(200).send({ question: await getQuestion(playerid), });
}));

app.get('/play/:playerid/answer', catchErrors(async (req, res) => {
  const { playerid, } = req.params;
  return res.status(200).send({ answerIds: await getAnswers(playerid), });
}));

app.put('/play/:playerid/answer', catchErrors(async (req, res) => {
  const { playerid, } = req.params;
  const { answerIds, } = req.body;
  await submitAnswers(playerid, answerIds);
  return res.status(200).send({});
}));

app.get('/play/:playerid/results', catchErrors(async (req, res) => {
  const { playerid, } = req.params;
  return res.status(200).send(await getResults(playerid));
}));

/***************************************************************
                       Running Server
***************************************************************/

app.get('/', (req, res) => res.redirect('/docs'));

// app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// const configData = JSON.parse(fs.readFileSync('./frontend/src/config.json'));
const port = 5005;

const server = app.listen(port, () => {
  console.log('Listening on port ' + port);
});

export default server;
