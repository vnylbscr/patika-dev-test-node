const { MongoClient, ObjectId } = require('mongodb');
const faker = require('faker');

console.time('process');
// NOTE! I used faker for the mock data, I can do it manually but it seems not required.
var uri = 'mongodb://localhost:27017/';
// create client
const client = new MongoClient(uri);
// collections array
const collections = ['users', 'courses', 'lessons', 'courseEnrollments', 'scores'];

const JOIN_COURSE_POINT = 2;
const COMPLETED_LESSON_POINT = 1;
const COMPLETED_COURSE_POINT = 10;

async function run() {
   try {
      // connect to db
      await client.connect();
      const db = client.db('patika-dev');
      console.log('processing...');
      // declaring dbs from collections
      const usersDb = db.collection('users');
      const coursesDb = db.collection('courses');
      const lessonsDb = db.collection('lessons');
      const courseEnrollmentsDb = db.collection('courseEnrollments');
      const scoresDb = db.collection('scores');

      // make e-mail field to unique for the users collection
      usersDb.createIndex(
         {
            emailAddress: 1,
         },
         { unique: true }
      );

      // creating mock data for lessons
      for (let index = 0; index < 30; index++) {
         const randomCourse = {
            isPublished: faker.datatype.boolean(),
            title: faker.lorem.sentence(),
            url: faker.internet.url(),
            createdAt: faker.date.between('2012-01-01', '2015-01-31'),
            updatedAt: faker.date.between('2012-01-01', '2015-01-31'),
         };

         let lessons = [];

         // creating 20 lessons for course
         for (let index = 0; index < 20; index++) {
            const lessonId = ObjectId();
            const lessonBody = faker.lorem.paragraph();

            // generate random lesson.
            const randomLesson = {
               _id: lessonId,
               isPublished: faker.datatype.boolean(),
               title: faker.lorem.sentence(),
               url: faker.internet.url(),
               body: lessonBody,
               createdAt: new Date(),
               updatedAt: new Date(),
            };

            // save randomCourse to database.
            await lessonsDb.insertOne({
               ...randomLesson,
            });

            // I'm getting course lessons manually. I could like this:

            // same lesson
            const item = {
               lessonId: lessonId,
               content: lessonBody,
            };

            lessons.push(item);
         }

         // save random courses to db with lessons
         await coursesDb.insertOne({
            ...randomCourse,
            content: lessons,
         });
      }
      // get all users from collection
      const allCourses = await coursesDb.find({}).toArray();
      // create 1000 random users
      for (let index = 0; index < 1000; index++) {
         const userId = ObjectId();
         const randomUser = {
            emailAddress: faker.internet.email(),
            name: faker.name.findName(),
            createdAt: new Date(),
            _id: userId,
         };

         const randomCourseIndex = generateRandom(allCourses.length - 1);
         const randomCourse = allCourses[randomCourseIndex];
         const lessonId = randomCourse.content.map((item) => item.lessonId);

         // generating random score
         const randScore = {
            userId,
            totalPoints: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            history: [
               {
                  point: 0,
                  date: new Date(),
                  courseId: randomCourse._id,
                  lessonId: lessonId[0],
               },
            ],
         };

         // add users to database
         await usersDb.insertOne({
            ...randomUser,
         });
         // add scores to each user
         await scoresDb.insertOne({
            ...randScore,
         });
      }

      // get all users from collection
      const allUsers = await usersDb.find({}).toArray();

      // add course enrollment with random number for each user
      for (const user of allUsers) {
         const randomNumber = generateRandom(10);

         for (let index = 0; index < randomNumber; index++) {
            // get random course
            const randomCourseFromDb = allCourses[generateRandom(10) - 1];
            // generate random number for completed lessons
            const generateRandomForCompletedLesson = generateRandom(20);
            let randomCompletedLessons = [];

            for (let index = 0; index < generateRandomForCompletedLesson; index++) {
               const item = {
                  // we can add random lesson from course
                  // I set it 19 because we added to 20 lessons for every course
                  lessonId: randomCourseFromDb.content[generateRandom(19)].lessonId, // adding random completed lessons to enrollments
                  date: new Date(),
               };
               randomCompletedLessons.push(item);
            }

            const randomCourseEnrollment = {
               userId: user._id,
               courseId: randomCourseFromDb._id,
               lastVisitedLesson: randomCourseFromDb.content.map((item) => item._id), // get course lesson
               lastCompletedLesson: randomCompletedLessons[randomCompletedLessons.length - 1], // last completed lesson
               completedLessons: randomCompletedLessons,
               createdAt: new Date(),
               updatedAt: new Date(),
            };

            await courseEnrollmentsDb.insertOne({
               ...randomCourseEnrollment,
            });
         }

         // calculating point for the each user
         for (const user of allUsers) {
            // find user's course enrollments
            const userCourseEnrollments = await courseEnrollmentsDb.find({ userId: user._id }).toArray();

            // point should starts with (enrollments * join course point)
            let point = userCourseEnrollments.length * JOIN_COURSE_POINT;
            let history = [];
            for (const userEnrollment of userCourseEnrollments) {
               // get the completed lessons count and start to calculate point each history.
               const completedLessonCount = await userEnrollment.completedLessons.length;
               point += completedLessonCount * COMPLETED_LESSON_POINT;

               // creating history item
               const historyItem = {
                  point: point * COMPLETED_COURSE_POINT, // if user completed all lessons
                  date: new Date(),
                  courseId: userEnrollment.courseId,
                  lessonId: userEnrollment.lastCompletedLesson, // getting last completed lesson
               };

               history.push(historyItem);
            }

            // calculate total points for each user with reduce func.
            const totalPoints = history.reduce((acc, item) => {
               return acc + item.point;
            }, 0);

            // save data to score collection
            await scoresDb.findOneAndUpdate(
               {
                  userId: user._id,
               },
               {
                  $set: { history, totalPoints },
               }
            );
         }
      }

      console.timeEnd('process');
      console.log('operation completed successfully! please check collections!');
   } catch (err) {
      console.log(err);
   } finally {
      // ensures that the client will close when you finish/error
      await client.close();
   }
}

run().catch(console.dir);

// function that to generate random numbers
const generateRandom = (max) => {
   const random = Math.round(Math.random() * max);
   if (random === 0) {
      return random + 1;
   } else if (max < 0) {
      throw new Error('Max value should be greater than zero!');
   } else {
      return random;
   }
};
