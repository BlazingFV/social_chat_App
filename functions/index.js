const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
exports.onCreateFollower = functions.firestore.document("/followers/{userId}/userFollowers/{followerId}")
    .onCreate(async (snapshot, context) => {
        console.log("follower Created", snapshot.data());
        const userId = context.params.userId;
        const followerId = context.params.followerId;

        //1: create  followed users posts ref
        const followedUserPostRef = admin
            .firestore()
            .collection('posts')
            .doc(userId)
            .collection('userPosts');
        // 2 : create following user timeline ref
        const timelinePostsRef = admin
            .firestore()
            .collection('timeline')
            .doc(followerId)
            .collection('timelinePosts');

        //3: get followed users posts
        const querySnapshot = await followedUserPostRef.get();

        //4: add each user post  to following user's timeline
        querySnapshot.forEach(doc => {
            if (doc.exists) {
                const postId = doc.id;
                const postData = doc.data();
                timelinePostsRef.doc(postId).set(postData);
            }
        })

    });

exports.onDeleteFollowers = functions
    .firestore
    .document("/followers/{userId}/userFollowers/{followerId}")
    .onDelete(async (snapshot, context) => {
        console.log("follower Deleted", snapshot.id);

        const userId = context.params.userId;
        const followerId = context.params.followerId;

        const timelinePostsRef = admin
            .firestore()
            .collection('timeline')
            .doc(followerId)
            .collection('timelinePosts').where("ownerId", "==", userId);
        const querySnapshot = await timelinePostsRef.get();
        querySnapshot.forEach(doc => {
            if (doc.exists) {
                doc.ref.delete();
            }
        });
    });

//when post is created , add post to timleline of each Follower of post owner
exports.onCreatePost = functions.firestore
    .document("/posts/{userId}/userPosts/{postId}")
    .onCreate(async (snapshot, context) => {
        const postCreated = snapshot.data();
        const userId = context.params.userId;
        const postId = context.params.postId;

        //1 get all followers of the user who made the post 
        const userFollowersRef = admin
            .firestore()
            .collection('followers')
            .doc(userId)
            .collection('userFollowers');
        const querySnapshot = await userFollowersRef.get();
        //2 add new post to each followers timeline

        querySnapshot.forEach(doc => {
            const followerId = doc.id;

            admin
                .firestore()
                .collection('timeline')
                .doc(followerId)
                .collection('timelinePosts')
                .doc(postId)
                .set(postCreated);

        });
    });

exports.onUpdatePost = functions.firestore
    .document("/posts/{userId}/userPosts/{postId}")
    .onUpdate(async (change, context) => {
        const postUpdated = change.after.data();
        const userId = context.params.userId;
        const postId = context.params.postId;

        //1 get all followers of the user who made the post 
        const userFollowersRef = admin
            .firestore()
            .collection('followers')
            .doc(userId)
            .collection('userFollowers');
        const querySnapshot = await userFollowersRef.get();
        // 2 update each post in followers timeline
        querySnapshot.forEach(doc => {
            const followerId = doc.id;

            admin
                .firestore()
                .collection('timeline')
                .doc(followerId)
                .collection('timelinePosts')
                .doc(postId)
                .get().then(doc => {
                    if (doc.exists) {
                       return doc.ref.update(postUpdated);
                    
                    }
                    return   doc.ref.update(postUpdated);
                }).catch(() => null);
        });
    });

exports.onDeletePost = functions.firestore
    .document("/posts/{userId}/userPosts/{postId}")
    .onDelete(async (snapshot, context) => {
        const userId = context.params.userId;
        const postId = context.params.postId;

        //1 get all followers of the user who made the post 
        const userFollowersRef = admin
            .firestore()
            .collection('followers')
            .doc(userId)
            .collection('userFollowers');
        const querySnapshot = await userFollowersRef.get();
        // 2 delete each post in followers timeline
        querySnapshot.forEach(async doc => {
            const followerId = doc.id;

           const doc_1 = await admin
                .firestore()
                .collection('timeline')
                .doc(followerId)
                .collection('timelinePosts')
                .doc(postId)
                .get();
            if (doc_1.exists) {
              return  doc_1.ref.delete();
            }
        });
    });

exports.onCreateActivityFeedItem = functions.firestore
    .document("/feed/{userId}/feedItems/{activityFeedItem}")
    .onCreate(async (snapshot, context) => {
        console.log('Activity Feed Item Created', snapshot.data());
        //1 get user connected to the feed 
        const userId = context.params.userId;

        const userRef = admin.firestore().doc(`users/${userId}`);
        const doc = await userRef.get();

        //2 once we have user, check if they have a notification token;
        //send notification if they have token 
        const androidNotificationToken = doc.data().androidNotificationToken;
        const createdactivityFeedItem = snapshot.data();
        if (androidNotificationToken) {
            // send notification 
            sendNotification(androidNotificationToken, createdactivityFeedItem);

        } else {
            console.log('no token for user , cannot send notification');
        }

        function sendNotification(androidNotificationToken, activityFeedItem) {
            let body;

            //3 switch body value based on notification type 
            switch (activityFeedItem.type) {
                case "comment":
                    body = `${activityFeedItem.username} replied: ${activityFeedItem.commentData}`;
                    break;
                case "like":
                    body = `${activityFeedItem.username} liked your post`;
                    break;
                case "follow":
                    body = `${activityFeedItem.username} is now following you!`;
                    break;
                default:
                    break;
            }
            //4 create message for push notification
            const message = {
                notification: { body },
                token: androidNotificationToken,
                data: { reciever: userId }
            };
            // 5 send message with admin.messaging()

            admin
                .messaging()
                .send(message)
                .then(response => {
                    // response is a message id string 
                   return console.log('successfully Sent message notification', response);
                }).catch(error => {
                    console.log('error occured', error);
                });
        }

    });



