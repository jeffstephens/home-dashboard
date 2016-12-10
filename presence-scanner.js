/**
 * ARP Scanner
 * Used to establish which devices are on the network and log that information
 * in a database so we can try to determine who's home and when in a separate
 * process.
 */

var exec = require('child_process').exec;
var FirebaseAdmin = require('firebase-admin');
firebaseApp = null;

FIREBASE_NAMESPACE = 'devices';

function initFirebase() {
  var serviceAccount = require("./service-account-creds.json");

  var dbURL = "https://home-dashboard-9604a.firebaseio.com";
  // var dbURL = "https://homebase-dev.firebaseio.com";

  var firebaseConfig = {
    credential: FirebaseAdmin.credential.cert(serviceAccount),
    databaseURL: dbURL,
  };
  firebaseApp = FirebaseAdmin.initializeApp(firebaseConfig);
}

function firebaseSet(key, value) {
  firebaseApp.database().ref(key).set(value);
}

function firebaseUpdate(key, value) {
  console.log("FIREBASE UPDATE: " + key, value);
  firebaseApp.database().ref(key).update(value);
}

function scanNetwork() {
  console.log("scanning");

  var scanDate = Date.now();

  var macRegex = /(\w{2}:\w{2}:\w{2}:\w{2}:\w{2}:\w{2})/;
  var ipRegex = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/;

  var cmd = 'sudo arp-scan -l';
  var newDeviceData = {};
  var lastKnownDeviceList = {};

  exec(cmd, function(error, stdout, stderr) {
    var outputLines = stdout.split('\n');

    for (var i = outputLines.length - 1; i >= 0; i--) {
      var macMatch = outputLines[i].match(macRegex);
      var ipMatch = outputLines[i].match(ipRegex);

      if (macMatch === null || ! macMatch) {
        continue;
      }

      var macAddress = macMatch[0];

      newDeviceData[macAddress] = {
        ipAddress: ipMatch[0],
        lastSeen: scanDate,
      };
    }

    /**
     * Check all our known devices, doing housekeeping & creating events
     */
    var devicesRef = firebaseApp.database().ref('devices');
    devicesRef.transaction( (deviceListInFirebase) => {
      if (deviceListInFirebase) {

        // iterate over list of updated devices, then commit those updates
        for (var deviceFirebaseKey in newDeviceData) {
          deviceListInFirebase[deviceFirebaseKey] = newDeviceData[deviceFirebaseKey];
        }

        lastKnownDeviceList = deviceListInFirebase;
        return deviceListInFirebase;

      } else {
        // seed the key with some dummy data. this is probably not best practice...
        return { "initialized": 1 };
      }

    }).then( () => {
      occupantsRef = firebaseApp.database().ref('occupants');

      occupantsRef.transaction( (occupants) => {
        if (occupants) {

          // update presence state for each occupant
          for (var occupantKey in occupants) {
            var thisOccupant = occupants[occupantKey];

            if (lastKnownDeviceList.hasOwnProperty(thisOccupant.deviceId)) {
              var associatedDevice = lastKnownDeviceList[thisOccupant.deviceId];

              // we declare that someone has left the premises if we haven't seen them in
              // 15 minutes
              var LEFT_HOME_THRESHOLD = 60 * 10 * 1000;

              if (Date.now() - associatedDevice.lastSeen < LEFT_HOME_THRESHOLD) {
                // device is online
                thisOccupant.status = "home";
              } else {
                // device is offline
                thisOccupant.status = "away";
              }

            }
          }

          return occupants;

        } else {
          // seed the key with some dummy data. this is probably not best practice...
          return { "initialized" : 1 }
        }
      })
    });
  });
}

initFirebase();

setInterval(scanNetwork, 10000);
scanNetwork();
