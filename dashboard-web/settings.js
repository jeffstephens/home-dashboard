firebaseConfig = require('../firebaseConfig')
USER_ID = null;
USER_PROFILE = null;
currentScannerId = null;

listenedLocations = [];

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

function setManagedPlace(newPlaceId) {
  return firebase.database().ref("users/" + USER_ID + "/placeBeingManaged").set(newPlaceId);
}



/**
 * SELECT A PLACE
 */



function addPlaceListing(deviceInfo, prepend) {
  if (typeof prepend == "undefined") {
    prepend = false;
  }

  // populate page structure
  var placeListSource = $("#place-list-template").html();
  var placeListTemplate = _.template(placeListSource);

  if (prepend) {
    $("#place-list-container").prepend(placeListTemplate({"deviceInfo": deviceInfo}));
  } else {
    $("#place-list-container").append(placeListTemplate({"deviceInfo": deviceInfo}));
  }
  updatePlacesListeners();
}

function getExplanationForSelection() {
  if (window.location.hash.length > 0) {
      return window.location.hash.substr(1);
  }
  return null;
}

function initManageLocationsFlow() {
  // did another page send us here to select a location?
  var explanationForSelection = getExplanationForSelection();

  var templateSource = $("#select-place-template").html();
  var placeTemplate = _.template(templateSource);
  $("#content").html(placeTemplate({ explanationForSelection: explanationForSelection }));
}

function showSelectPlaceFlow() {
  initManageLocationsFlow();

  // list places we're allowed to see
  listenedLocations.push("userPlaceMap");
  firebase.database().ref("userPlaceMap").child(USER_ID).on("value", function(placesSnapshot) {
    var placeList = placesSnapshot.val();
    var devicesFoundCount = 0;

    if (placeList) {
      _.each(placeList, function(place, placeId) {
        console.debug("looking up ", "places/" + placeId);
        firebase.database().ref("places/" + placeId).once("value", function(singlePlaceSnapshot) {
          var singlePlace = singlePlaceSnapshot.val();

          if (singlePlace) {
            // populate page structure
            var placeListSource = $("#place-list-template").html();
            var placeListTemplate = _.template(placeListSource);

            var thisDeviceInfo = {
              "deviceFound": true,
              "placeName": singlePlace.name,
              "placeId": placeId
            };

            addPlaceListing(thisDeviceInfo, true);
            updatePlacesListeners();
            devicesFoundCount++;
          }

          findLocalScanners(devicesFoundCount);
        });
      });
    }

  }, function(err) {
    console.error("Failed to look up userPlaceMap", err);
  });
}

function findLocalScanners(numDevicesFound) {
  /* Three options:
   *
   * No device on the network of any kind - display instructions to set up a device
   * Device on the network that's already in use - must be invited
   * Unclaimed device on the network - display UI to initialize it
  */

  // get IP address to check for scanners on the same network
  $.getJSON("//api.ipify.org?format=json")
    .done(function(result) {
      var ipAddress = result.ip.trim();

      // look up scanners with the same IP address
      firebase.database().ref("scanners").orderByChild("ipAddress").equalTo(ipAddress).once("value", function(scannerSnapshot) {
        var nearbyScanners = scannerSnapshot.val();

        if (nearbyScanners) {
          _.each(nearbyScanners, function(scanner, scannerId) {
            if (scanner.hasOwnProperty("placeId")) {
              // place attached to this scanner

              // is it a place we have access to? if so, we are already showing the device outright
              firebase.database().ref("userPlaceMap").child(USER_ID).child(scanner.placeId).once("value", function(userPlaceMapSnapshot) {
                if ( ! userPlaceMapSnapshot.exists()) {
                  console.debug("Nearby device exists, but it's already associated to a place.");
                  var thisDeviceInfo = {
                    "claimedDeviceAvailable": true,
                    "deviceId": _.clone(scannerId)
                  };

                  addPlaceListing(thisDeviceInfo);
                } else {
                  console.debug("Ignoring nearby device with a place because we have full access to it.");
                }
              });
            } else {
              // no places attached to this scanner
              console.debug("Nearby device exists with no place association!");

              var thisDeviceInfo = {
                "unclaimedDeviceAvailable": true,
                "deviceId": _.clone(scannerId)
              };

              addPlaceListing(thisDeviceInfo);
            }
          });
        } else {
          // no scanners matching this IP address
          console.debug("No nearby devices found");

          if (numDevicesFound === 0) {
            var thisDeviceInfo = {
              "noDevicesFound": true,
            };

            addPlaceListing(thisDeviceInfo);
          }
        }
      }, function(err) {
        console.error("Failed to list scanners by IP address", err);
      });
    })
    .fail(function() {
      var failedToLocateSource = $("#failed-to-locate-template").html();
      var failedToLocateTemplate = _.template(failedToLocateSource);
      $("#place-list-container").append(failedToLocateTemplate());
    });
}

function updatePlacesListeners() {
  $(".setup-scanner-button").unbind().on("click", function() {
    var newPlaceName = prompt("Name your current location:");
    var scannerId = $(this).data("scanner-id");

    var usersObject = {};
    usersObject[USER_ID] = true;

    var newPlaceId = firebase.database().ref("places").push({
      "name" : newPlaceName,
      "scannerId": scannerId,
      "users": usersObject
    }).key;

    firebase.database().ref("scanners/" + scannerId + "/placeId").set(newPlaceId);
    firebase.database().ref("userPlaceMap/" + USER_ID + "/" + newPlaceId).set({"granted": firebase.database.ServerValue.TIMESTAMP});

    setManagedPlace(newPlaceId);
    initAuth(initSettingsFlow);
  });

  $(".manage-place-button").unbind().on("click", function() {
    var placeId = $(this).data("place-id");

    setManagedPlace(placeId);
    initAuth(initSettingsFlow);
  });
}



/**
 * NETWORK DEVICES
 */


function updateDeviceListeners() {
  $("button.edit-device-name").unbind().on('click', function() {
    var friendlyName = $(this).data("friendly-name");
    var macAddress = $(this).data("mac-address");
    var promptMessage = null;

    if (friendlyName) {
      promptMessage = "Rename " + friendlyName;
    } else {
      promptMessage = "Rename " + macAddress;
    }

    var newName = prompt(promptMessage);

    if (newName) {
      nameDevice(macAddress, newName);
    }
  });

  $("button.hide-device").unbind().on('click', function() {
    var friendlyName = $(this).data("friendly-name");
    var macAddress = $(this).data("mac-address");
    var promptMessage = null;

    if (friendlyName) {
      promptMessage = "Really hide " + friendlyName + "?";
    } else {
      promptMessage = "Really hide " + macAddress + "?";
    }

    var reallyHide = confirm(promptMessage);

    if (reallyHide) {
      hideDevice(macAddress);
    }
  });

  $("button.show-device").unbind().on('click', function() {
    var friendlyName = $(this).data("friendly-name");
    var macAddress = $(this).data("mac-address");
    var promptMessage = null;

    if (friendlyName) {
      promptMessage = "Really show " + friendlyName + "?";
    } else {
      promptMessage = "Really show " + macAddress + "?";
    }

    var reallyHide = confirm(promptMessage);

    if (reallyHide) {
      showDevice(macAddress);
    }
  });

  $("button.change-place-button").unbind().on("click", function() {
    firebase.database().ref("users/" + USER_ID + "/placeBeingManaged").set(0, function() {
      initAuth(initSettingsFlow);
    });
  });
}

function watchPlaceManagers() {
  var placeManagers = null;

  firebase.database().ref("places/" + USER_PROFILE["placeBeingManaged"]).child("users").on("value", function(userIdListSnapshot) {
    var userIdList = userIdListSnapshot.val();

    if (userIdList) {
      var managers = [];

      _.each(userIdList, function(value, userId) {
        firebase.database().ref("users").child(userId).once("value", function(userDataSnapshot) {
          var userData = userDataSnapshot.val();

          if (userData) {
            managers.push(userData);
          }
        });
      });

      // populate list of users who can manage this place
      var managerTemplateSource = $("#placemanager-profile-template").html();
      var managerTemplate = _.template(managerTemplateSource);
      $("#people-container").html(managerTemplate({"users": managers}));
    }
  });
}

function watchPlaces() {
  var place = null;

  firebase.database().ref("places/" + USER_PROFILE["placeBeingManaged"]).once("value", function(snapshot) {
    place = snapshot.val();

    if (place) {
      currentScannerId = place.scannerId;
      var devicePath = 'devices/' + currentScannerId;
      listenedLocations.push(devicePath);

      firebase.database().ref(devicePath).on('value', function(snapshot) {
        var deviceList = snapshot.val();
        deviceCache = deviceList;

        var shownDevices = [];
        var hiddenDevices = [];

        for (var macAddress in deviceList) {
          if (deviceList.hasOwnProperty(macAddress)) {
            var deviceInfo = deviceList[macAddress];
            deviceInfo.macAddress = macAddress;
            deviceInfo.rawLastSeen = deviceInfo.lastSeen;
            deviceInfo.lastSeen = moment(deviceInfo.lastSeen).fromNow();

            if (deviceInfo.hasOwnProperty('hideInDashboard') && deviceInfo.hideInDashboard) {
              hiddenDevices.push(deviceInfo);
            } else {
              shownDevices.push(deviceInfo);
            }
          }
        }

        // build page structure
        var structureTemplateSource = $("#manage-device-template").html();
        var structureTemplate = _.template(structureTemplateSource);
        $("#content").html(structureTemplate({"placeName": place.name}));

        // populate page structure
        var templateSource = $("#device-profile-template").html();

        var shownTemplate = Handlebars.compile(templateSource);
        $("#shown-device-container").html(shownTemplate({"devices": shownDevices}));

        var hiddenTemplate = Handlebars.compile(templateSource);
        $("#hidden-device-container").html(shownTemplate({"devices": hiddenDevices}));

        updateDeviceListeners();
        watchPlaceManagers();
      });
    } else {
      resetPlaceBeingManaged();
    }
  }, function() {
    // no such place exists (or we can't see it)

    console.log("Invalid place - resetting state");

    if (place === null) {
      resetPlaceBeingManaged();
    }
  });
}

function resetPlaceBeingManaged() {
  firebase.database().ref("users/" + USER_ID + "/placeBeingManaged").set(0);
  initAuth(initSettingsFlow);
}

function getDeviceRoot(macAddress) {
  if (currentScannerId === null && typeof currentScannerId !== 'undefined') {
    return null;
  }
  return "devices/" + currentScannerId + "/" + macAddress;
}

function nameDevice(macAddress, newName) {
  var deviceKey = getDeviceRoot(macAddress);
  newData = {
    friendlyName: newName
  };
  firebaseUpdate(deviceKey, newData);
}

function hideDevice(macAddress) {
  var deviceKey = getDeviceRoot(macAddress);
  newData = {
    hideInDashboard: true
  };
  firebaseUpdate(deviceKey, newData);
}

function showDevice(macAddress) {
  var deviceKey = getDeviceRoot(macAddress);
  newData = {
    hideInDashboard: false
  };
  firebaseUpdate(deviceKey, newData);
}


/**
 * AUTHENTICATION
 */


function initAuth(callbackWhenLoggedin) {
  firebase.auth().onAuthStateChanged(function(user) {
    if ( ! user) {
      window.location.href="/login.html";
    } else {
      USER_ID = user.uid;

      firebase.database().ref("users").child(USER_ID).once("value", function(snapshot) {
        USER_PROFILE = snapshot.val();

        // check for malformed data... we can't do much if we don't have userdata
        if (USER_PROFILE === null) {
          firebase.auth().signOut();
          return;
        }

        callbackWhenLoggedin();
      });
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

function cleanupListeners() {
  _.each(listenedLocations, function(location) {
    firebase.database().ref(location).off();
  });

  listenedLocations = [];
}

function initSettingsFlow() {
  cleanupListeners();

  if (typeof USER_PROFILE.placeBeingManaged !== "undefined" && USER_PROFILE.placeBeingManaged) {
    var explanationForSelection = getExplanationForSelection();

    if (explanationForSelection !== null) {
      if (explanationForSelection === "dashboard-no-place") {
        window.location.href = "/index.html";
      }
    } else {
      watchPlaces();
    }
  } else {
    showSelectPlaceFlow();
  }
}


/**
 * INITIALIZATION - WHERE EVERYTHING STARTS
 */


initFirebase();
initAuth(initSettingsFlow);
initUI();
