// TODO: add require.js to abstract firebase config object into one file to be referenced later
// firebaseConfig = require('../firebaseConfig')
firebaseConfig = {
  "apiKey": "AIzaSyDEHc7ws4S0JeV2HuDvMMjTFqbO-TDkgd8",
  "authDomain": "home-dashboard-9604a.firebaseapp.com",
  "databaseURL": "https://home-dashboard-9604a.firebaseio.com",
  "storageBucket": "home-dashboard-9604a.appspot.com"
}

/**
 * FIREBASE
 */


function initFirebase() {
  firebase.initializeApp(firebaseConfig);
}

function firebaseUpdate(key, value) {
  firebase.database().ref(key).update(value);
}

function firebasePush(parentKey, value) {
  firebase.database().ref().child(parentKey).push(value);
}


/**
 * EVENTS
 */

occupantCache = {};
eventCache = {};

function initData() {
  let occupantsList = firebase.database().ref('occupants');
  occupantsList.on('value', (snapshot) => {
    occupantCache = snapshot.val();
  });

  let eventsList = firebase.database().ref('events');
  eventsList.orderByChild("timestamp").limitToLast(50).on('value', (snapshot) => {
    let resultList = snapshot.val();
    eventCache = resultList;
    processEvents();
  });
}

function forceUpdate() {
  processEvents(eventCache);
}

function processEvents() {
  let resultArray = [];

  for (let eventId in eventCache) {
    if (eventCache.hasOwnProperty(eventId)) {
      let thisEvent = eventCache[eventId];

      thisEvent.relativeTimestamp = moment(thisEvent.timestamp).fromNow();
      thisEvent.occupantName = occupantCache[thisEvent.occupantId].name;

      thisEvent.leftHome = thisEvent.type == "leftHome";
      thisEvent.arrivedHome = thisEvent.type == "arrivedHome";

      resultArray.push(thisEvent);
    }
  }

  updateOccupantsDisplay(resultArray.reverse());
}

function updateOccupantsDisplay(occupantArray) {
  let templateSource = $("#events-template").html();
  let template = Handlebars.compile(templateSource);
  $('#events-container').html(template({"events": occupantArray}));
}


/**
 * AUTHENTICATION
 */

function initAuth() {
  firebase.auth().onAuthStateChanged(function(user) {
    if ( ! user) {
      window.location.href="./login.html";
    }
  });
}


/**
 * UI
 */


function initUI() {
  $('#signout').on('click', function(event) {
    event.preventDefault();
    firebase.auth().signOut();
  });
}


/**
 * INITIALIZATION - WHERE EVERYTHING STARTS
 */


initFirebase();
initAuth();
initData();

setInterval(forceUpdate, 30000);
