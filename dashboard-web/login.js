// TODO: add require.js to abstract firebase config object into one file to be referenced later
// firebaseConfig = require('../firebaseConfig')
firebaseConfig = {
  "apiKey": "AIzaSyDEHc7ws4S0JeV2HuDvMMjTFqbO-TDkgd8",
  "authDomain": "home-dashboard-9604a.firebaseapp.com",
  "databaseURL": "https://home-dashboard-9604a.firebaseio.com",
  "storageBucket": "home-dashboard-9604a.appspot.com"
}

USER_INITIALIZED = false;

/**
 * FIREBASE
 */

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
}

function firebaseUpdate(key, value) {
  console.log("Updating firebase " + key, value);
  firebase.database().ref(key).update(value);
}

function firebasePush(parentKey, value) {
  firebase.database().ref().child(parentKey).push(value);
}


/**
 * AUTH
 */


function initAuth() {
  // if we're logged in, skip this page
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      prepareUserdataOrLogin(user);
    }
  });
}

function userIsInitialized(userData) {
  var requiredFields = [
    "emailAddress",
    "placeBeingManaged"
  ];

  for (var i = requiredFields.length - 1; i >= 0; i--) {
    if ( ! userData.hasOwnProperty(requiredFields[i])) {
      return false;
    }
  }

  return true;
}

function prepareUserdataOrLogin(user) {
  if (USER_INITIALIZED) {
    window.location.href="/";
    return;
  }

  var userDataRef = firebase.database().ref("users").child(user.uid);
  userDataRef.transaction(function(userData) {
    // initialize our userData object if necessary
    if (userData === null || ! userData) {
      console.debug("userdata is null, initializing it");
      userData = {};
    } else if (userIsInitialized(userData)) {
      USER_INITIALIZED = true;
      return;
    }

    if ( ! userData.hasOwnProperty("emailAddress")) {
      var fullUser = firebase.auth().currentUser;
      if (fullUser) {
        userData["emailAddress"] = fullUser.email;
      }
    }

    if ( ! userData.hasOwnProperty("placeBeingManaged")) {
      userData["placeBeingManaged"] = 0;
    }

    return userData;
  }, function() {
    prepareUserdataOrLogin(user);
  });
}


/**
 * FORM SUBMISSION
 */


function initUIListeners() {
  $('#login-form').on('submit', function(event) {
    event.preventDefault();
    $("#error-container").html('');

    console.debug('Form submitted');

    var email = $('#email').val();
    var password = $('#password').val();

    firebase.auth().signInWithEmailAndPassword(email, password).catch(function (error) {
      var errorType = error.code;
      var errorMessage = null;

      switch (errorType) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/user-disabled':
          errorMessage = 'No user was found with those credentials.';
          break;

        case 'auth/invalid-email':
          errorMessage = 'That email address doesn\'t look right.';
          break;

        default:
          errorMessage = 'Something went wrong... try again in a few minutes.';
      }

      showError(errorMessage);
    });
  });

  $("#reset-form").on('submit', function(event) {
    event.preventDefault();
    $("#error-container").html('');

    var email = $("#reset-email").val();

    firebase.auth().sendPasswordResetEmail(email)
      .then(function() {
        showSuccess('Check your email to finish resetting your password.');
      })
      .catch(function (error) {
      var errorType = error.code;
      var errorMessage = null;

      switch (errorType) {
        case 'auth/user-not-found':
          errorMessage = 'No user was found with those credentials.';
          break;

        case 'auth/invalid-email':
          errorMessage = 'That email address doesn\'t look right.';
          break;

        default:
          errorMessage = 'Something went wrong... try again in a few minutes.';
      }

      showError(errorMessage);
    });
  });
}

function showError(errorMessage) {
  var templateSource = $("#form-error-template").html();
  var template = Handlebars.compile(templateSource);
  $('#error-container').html(template({"errorMessage": errorMessage}));
}

function showSuccess(message) {
  var templateSource = $("#form-success-template").html();
  var template = Handlebars.compile(templateSource);
  $('#success-container').html(template({"message": message}));
}


/**
 * INITIALIZATION - WHERE EVERYTHING STARTS
 */


initFirebase();
initAuth();
initUIListeners();
