// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const express = require('express');
const router = express.Router();
const util = require('util');
const apiHelper = require('../lib/api_helper');

const MAX_CONVERSATION_STARTERS = 5;

// Constant for an entry point that should not be used
const IGNORE_ENTRY_POINT = 'IGNORE';

// Constant for supported entry points
const ALLOWED_ENTRY_POINTS = ['PLACESHEET', 'MAPS_TACTILE', 'IGNORE'];

/**
 * Location listing page.
 */
router.get('/', function(req, res, next) {
  const brandId = req.query.brandId;

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // setup the parameters for the API call
    const apiParams = {
      auth: apiObject.authClient,
      parent: brandId,
    };

    apiObject.bcApi.brands.locations.list(apiParams, {},
        function(err, response) {
          res.render('locations/list', {
            locations: response.data.locations,
            brandId: brandId,
          });
        });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create a new location.
 */
router.get('/create', function(req, res, next) {
  const brandId = req.query.brandId;

  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  // Creates default location values for the form
  const location = {
    placeId: '',
    locationTestUrl: '',
    agent: '',
    defaultLocale: 'en',
    conversationalSettings: {
      en: {
        privacyPolicy: {
          url: '',
        },
        welcomeMessage: {
          text: '',
        },
        offlineMessage: {
          text: '',
        },
      },
    },
    locationEntryPointConfigs: [
      {
        allowedEntryPoint: 'PLACESHEET',
      },
      {
        allowedEntryPoint: 'MAPS_TACTILE',
      },
    ],
  };

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    const apiParams = {
      auth: apiObject.authClient,
      parent: brandId,
    };

    apiObject.bcApi.brands.agents.list(apiParams, {}, function(err, response) {
      let agents = response.data.agents !== undefined ? response.data.agents : [];

      res.render('locations/edit', {
        title: 'Create Location',
        location: location,
        agents: agents,
        formUrl: '/locations/save?brandId=' + brandId,
        brandId: brandId,
        isEdit: false,
        message: message,
        allowedEntryPoints: ALLOWED_ENTRY_POINTS,
      });
    });
  });
});

/**
 * Edit an existing location.
 */
router.get('/edit', function(req, res, next) {
  const locationId = req.query.locationId;
  const brandId = req.query.brandId;

  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // setup the parameters for the API call
    let apiParams = {
      auth: apiObject.authClient,
      name: locationId,
    };

    apiObject.bcApi.brands.locations.get(apiParams, {},
        function(err, response) {
          const location = response.data;

          if (location.conversationalSettings === undefined) {
            location.conversationalSettings = {
              en: {
                privacyPolicy: {
                  url: '',
                },
                welcomeMessage: {
                  text: '',
                },
                offlineMessage: {
                  text: '',
                },
              },
            };
          }

          apiParams = {
            auth: apiObject.authClient,
            parent: brandId,
          };

          apiObject.bcApi.brands.agents.list(apiParams, {},
              function(err, response) {
                res.render('locations/edit',
                    {
                      location: location,
                      title: 'Edit Location',
                      formUrl: '/locations/save?locationId=' + locationId + '&brandId=' + brandId,
                      brandId: brandId,
                      isEdit: true,
                      message: message,
                      agents: response.data.agents,
                      allowedEntryPoints: ALLOWED_ENTRY_POINTS,
                    });
              });
        });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create/update a location.
 */
router.post('/save', function(req, res, next) {
  let locationId = false;
  const brandId = req.query.brandId;

  if (req.query.locationId !== undefined) {
    locationId = req.query.locationId;
    method = 'PATCH';
  }

  const formObject = req.body;

  const locationObject = {
    placeId: formObject.placeId,
    agent: formObject.agent,
    defaultLocale: formObject.defaultLocale,
    conversationalSettings: { },
    locationEntryPointConfigs: getEntryPoints(formObject),
  };

  // Add the conversational settings
  if(Array.isArray(formObject.locale)) {
    for(let i = 0; i < formObject.locale.length; i++) {
      locationObject.conversationalSettings[formObject.locale[i]] = {
        privacyPolicy: {
          url: formObject.privacyPolicy[i],
        },
        welcomeMessage: {
          text: formObject.welcomeMessage[i],
        },
        offlineMessage: {
          text: formObject.offlineMessage[i],
        },
        conversationStarters: getConversationalStarters(formObject, 'conversationalStarter', i * MAX_CONVERSATION_STARTERS),
      };
    }
  }
  else {
    locationObject.conversationalSettings[formObject.locale] = {
      privacyPolicy: {
        url: formObject.privacyPolicy,
      },
      welcomeMessage: {
        text: formObject.welcomeMessage,
      },
      offlineMessage: {
        text: formObject.offlineMessage,
      },
      conversationStarters: getConversationalStarters(formObject, 'conversationalStarter', 0),
    };
  }

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // Update location
    if (locationId) {
      updateLocation(res, brandId, locationId, locationObject, apiObject);
    } else { // Create location
      createLocation(res, brandId, locationObject, apiObject);
    }
  });
});

/**
 * Patches the location's associated agent value. If there are no errors,
 * the user is redirected to the list of all locations for the brand.
 *
 * @param {object} res The HTTP response object.
 * @param {string} brandId The brand id for the location.
 * @param {string} locationId The location id for the location being updated.
 * @param {object} locationObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function updateLocation(res, brandId, locationId, locationObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    name: locationId,
    resource: locationObject,
    updateMask: 'agent,conversationalSettings,defaultLocale',
  };

  apiObject.bcApi.brands.locations.patch(apiParams, {},
    function(err, response) {
      if (err !== undefined && err !== null) {
        handleError(res, err, brandId, locationId);
      } else {
        res.redirect('/locations?brandId=' + brandId);
      }
    });
}

/**
 * Creates a new. If there are no errors,
 * the user is redirected to the list of all locations for the brand.
 *
 * @param {object} res The HTTP response object.
 * @param {string} brandId The brand id for the location.
 * @param {object} locationObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function createLocation(res, brandId, locationObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    parent: brandId,
    resource: locationObject,
  };

  apiObject.bcApi.brands.locations.create(apiParams, {},
    function(err, response) {
      if (err !== undefined && err !== null) {
        handleError(res, err, brandId);
      } else {
        res.redirect('/locations?brandId=' + brandId);
      }
    });
}

/**
 * Parses the form key/value pairs into an array
 * of conversation starter objects.
 *
 * @param {object} formObject Key/value pairs from the HTML form.
 * @param {string} prefix The prefix string for the form keys.
 * @param {int} startIndex The starting index for the starters array.
 * @return Array of conversation starters.
 */
function getConversationalStarters(formObject, prefix, startIndex) {
  const conversationalStarters = [];

  for (let i = startIndex; i < startIndex + MAX_CONVERSATION_STARTERS; i++) {
    if (formObject[prefix+'.text'][i] != '') {
      if (formObject[prefix+'.url'][i] != '') {
        conversationalStarters.push({
          suggestion: {
            action: {
              text: formObject[prefix+'.text'][i],
              postbackData: formObject[prefix+'.postbackData'][i],
              openUrlAction: { url: formObject[prefix+'.url'][i] }
            },
          },
        });
      }
      else {
        conversationalStarters.push({
          suggestion: {
            reply: {
              text: formObject[prefix+'.text'][i],
              postbackData: formObject[prefix+'.postbackData'][i],
            },
          },
        });
      }
    }
  }

  return conversationalStarters;
}

/**
 * Parses the error and redirects to display the error message.
 *
 * @param {object} res The HTTP response object.
 * @param {object} error The error object.
 * @param {string} brandId The brand id for the location.
 * @param {string} locationId The location id for the location being updated.
 * @param {object} apiObject The BC API object.
 */
function handleError(res, error, brandId, locationId) {
  console.log(util.inspect(error, {showHidden: false, depth: null}));

  const errorMessage = error.errors[0].message;

  let url = '/locations/edit?brandId=' + brandId + '&message=' + errorMessage +
    '&locationId=' + locationId;

  if (locationId === undefined) {
    url = '/locations/create?brandId=' + brandId + '&message=' + errorMessage;
  }

  res.redirect(url);
}

/**
 * Converts the form input for entry points into a JSON object to
 * store via the API. Any "ignore" selections are not included.
 * @param {object} formObject The form values.
 * @return {object} A JSON object representing the selected entry points.
 */
function getEntryPoints(formObject) {
  const entryPoints = [];
  for (let i = 0; i < formObject['allowedEntryPoint[]'].length; i++) {
    if (formObject['allowedEntryPoint[]'][i] !== IGNORE_ENTRY_POINT) {
      entryPoints.push({allowedEntryPoint: formObject['allowedEntryPoint[]'][i]});
    }
  }

  return entryPoints;
}

module.exports = router;
