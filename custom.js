/**
 * Question Schema
 *
 * {
 *    answers: String[],
 *    question: String
 *    duration: Number,
 *    points: Number,
 *    media: {
 *      type: 'image' | 'video',
 *      src: '',
 *    },
 *    correctAnswers: number[]
 * }
 */

/*
 For a given data structure of a question, produce another
 object that doesn't contain any important meta data (e.g. the answer)
 to return to a "player"
*/
export const quizQuestionPublicReturn = ({ id, answers, question, duration, points, media, type, correctAnswers }) => {
  return { id, answers, question, duration, points, media, type, correctAnswers };
};

/*
 For a given data structure of a question, get the IDs of
 the correct answers (minimum 1).
*/
export const quizQuestionGetCorrectAnswers = ({answers, correctAnswers}) => {
  return correctAnswers;
};

/*
 For a given data structure of a question, get the IDs of
 all of the answers, correct or incorrect.
*/
export const quizQuestionGetAnswers = question => {
  return question.answers; // For a single answer
};

/*
 For a given data structure of a question, get the duration
 of the question once it starts. (Seconds)
*/
export const quizQuestionGetDuration = question => {
  return question.duration;
};
