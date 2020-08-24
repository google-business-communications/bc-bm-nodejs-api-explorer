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
const ct = require('countries-and-timezones');
const apiHelper = require('../lib/api_helper');

const MAX_CONVERSATION_STARTERS = 5;

// Default hours for a location when not set by an agent
const TEMPLATE_HOURS = [{
  endTime: {hours: '23', minutes: '59'},
  timeZone: '',
  startDay: 'MONDAY',
  endDay: 'SUNDAY',
}];

/**
 * Agent listing page.
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

    apiObject.bcApi.brands.agents.list(apiParams, {}, function(err, response) {
      let agents = response.data.agents !== undefined ? response.data.agents : [];

      res.render('agents/list', {
        agents: agents,
        brandId: brandId,
      });
    });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create an agent page.
 */
router.get('/create', function(req, res, next) {
  const brandId = req.query.brandId;

  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  const timezones = ct.getAllTimezones();

  // Create empty agent so fields render as defaults
  const agent = {
    displayName: '',
    businessMessagesAgent: {
      customAgentId: '',
      logoUrl: '',
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
      primaryAgentInteraction: {
        interactionType: 'BOT',
        botRepresentative: {
          botMessagingAvailability: {
            hours: TEMPLATE_HOURS,
          },
        },
      },
      additionalAgentInteractions: [
        {
          interactionType: 'HUMAN',
          humanRepresentative: {
            humanMessagingAvailability: {
              hours: TEMPLATE_HOURS,
            },
          },
        },
      ],
    },
  };

  res.render('agents/edit', {
    agent: agent,
    title: 'Create Agent',
    formUrl: '/agents/save?brandId=' + brandId,
    brandId: brandId,
    isEdit: false,
    timezones: Object.keys(timezones),
    message: message,
  });
});

/**
 * Edit an existing agent page.
 */
router.get('/edit', function(req, res, next) {
  const agentId = req.query.agentId;
  const brandId = req.query.brandId;

  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  const timezones = ct.getAllTimezones();

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // setup the parameters for the API call
    const apiParams = {
      auth: apiObject.authClient,
      name: agentId,
    };

    // Get the agent details to show in the edit form
    apiObject.bcApi.brands.agents.get(apiParams, {}, function(err, response) {
      console.log(err);
      console.log(response);

      const agent = response.data;

      res.render('agents/edit', {
        agent: agent,
        title: 'Edit Agent',
        formUrl: '/agents/save?agentId=' + agentId + '&brandId=' + brandId,
        brandId: brandId,
        isEdit: true,
        timezones: Object.keys(timezones),
        templateHours: TEMPLATE_HOURS,
        message: message,
      });
    });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create/update an agent.
 */
router.post('/save', function(req, res, next) {
  let agentId = false;
  if (req.query.agentId !== undefined) {
    agentId = req.query.agentId;
  }

  let brandId = req.query.brandId;

  const formObject = req.body;

  const agentObject = {
    displayName: formObject.displayName,
    businessMessagesAgent: {
      customAgentId: formObject.customAgentId,
      logoUrl: formObject.logoUrl,
      defaultLocale: formObject.defaultLocale,
      conversationalSettings: { },
      entryPointConfigs: [
        {
          allowedEntryPoint: 'LOCATION',
        },
      ],
    },
  };

  // Add the conversational settings
  if(Array.isArray(formObject.locale)) {
    for(let i = 0; i < formObject.locale.length; i++) {
      agentObject.businessMessagesAgent.conversationalSettings[formObject.locale[i]] = {
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
    agentObject.businessMessagesAgent.conversationalSettings[formObject.locale] = {
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

  // Set the primary representation
  agentObject.businessMessagesAgent.primaryAgentInteraction =
    getRepresentative(formObject,
        formObject['primaryAgentInteraction.interactionType'], 'primary');

  // Set the additional representation if it exists
  if (formObject['additionalAgentInteraction.interactionType'] != undefined) {
    agentObject.businessMessagesAgent.additionalAgentInteractions =
      getRepresentative(formObject,
          formObject['additionalAgentInteraction.interactionType'], 'additional');
  }

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // Update location
    if (agentId) {
      updateAgent(res, brandId, agentId, agentObject, apiObject);
    } else { // Create location
      createAgent(res, brandId, agentObject, apiObject);
    }
  });
});

/**
 * Patches the agent name and agent values. If there are no errors,
 * the user is redirected to the list of all locations for the brand.
 *
 * @param {object} res The HTTP response object.
 * @param {string} brandId The brand id for the location.
 * @param {string} agentId The agent id for the agent being updated.
 * @param {object} agentObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function updateAgent(res, brandId, agentId, agentObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    name: agentId,
    resource: agentObject,
    updateMask: 'display_name,business_messages_agent',
  };

  apiObject.bcApi.brands.agents.patch(apiParams, {}, function(err, response) {
    if (err !== undefined && err !== null) {
      handleError(res, err, brandId, agentId);
    } else {
      res.redirect('/agents?brandId=' + brandId);
    }
  });
}

/**
 * Creates a new agent. If there are no errors,
 * the user is redirected to the list of all locations for the brand.
 *
 * @param {object} res The HTTP response object.
 * @param {string} brandId The brand id for the location.
 * @param {object} agentObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function createAgent(res, brandId, agentObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    parent: brandId,
    resource: agentObject,
  };

  apiObject.bcApi.brands.agents.create(apiParams, {}, function(err, response) {
    console.log(err);
    if (err !== undefined && err !== null) {
      handleError(res, err, brandId);
    } else {
      res.redirect('/agents?brandId=' + brandId);
    }
  });
}

/**
 * Parses the error and redirects to display the error message.
 *
 * @param {object} res The HTTP response object.
 * @param {object} error The error object.
 * @param {string} brandId The brand id.
 * @param {string} agentId The agent id.
 * @param {object} apiObject The BC API object.
 */
function handleError(res, error, brandId, agentId) {
  console.log(util.inspect(error, {showHidden: false, depth: null}));

  const errorMessage = error.errors[0].message;

  let url = '/agents/edit?brandId=' + brandId + '&message=' + errorMessage +
      '&agentId=' + agentId;
  if (!agentId) {
    url = '/agents/create?brandId=' + brandId + '&message=' + errorMessage;
  }

  res.redirect(url);
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
 * Gets the represenative object from the form values.
 *
 * @param {object} formObject Key/value pairs from the HTML form.
 * @param {string} interactionType Bot/human interaction type.
 * @param {string} prefix The prefix string for the form keys.
 * @return The represenative.
 */
function getRepresentative(formObject, interactionType, prefix) {
  if (interactionType != undefined) {
    if (interactionType === 'BOT') {
      return {
        interactionType: interactionType,
        botRepresentative: {
          botMessagingAvailability: {
            hours: getTimeObject(formObject, prefix),
          },
        },
      };
    } else {
      return {
        interactionType: interactionType,
        humanRepresentative: {
          humanMessagingAvailability: {
            hours: getTimeObject(formObject, prefix),
          },
        },
      };
    }
  }

  return {};
}

/**
 * Gets the start and end time information for an interaction.
 *
 * @param {object} formObject Key/value pairs from the HTML form.
 * @param {string} prefix The prefix string for the form keys.
 * @return The data/time information for an interaction.
 */
function getTimeObject(formObject, prefix) {
  const timeObjects = [];

  // If an array, push all values onto the the time object
  if (Array.isArray(formObject[prefix + '.availability.startTime.hours'])) {
    for (let i = 0; i < formObject[prefix + '.availability.startTime.hours'].length; i++) {
      timeObjects.push({
        startTime: {
          hours: formObject[prefix + '.availability.startTime.hours'][i],
          minutes: formObject[prefix + '.availability.startTime.minutes'][i],
        },
        endTime: {
          hours: formObject[prefix + '.availability.endTime.hours'][i],
          minutes: formObject[prefix + '.availability.endTime.minutes'][i],
        },
        timeZone: formObject[prefix + '.availability.timezone'][i],
        startDay: formObject[prefix + '.availability.startDay'][i],
        endDay: formObject[prefix + '.availability.endDay'][i],
      });
    }
  } else { // Not an array, so push only the one form element
    timeObjects.push({
      startTime: {
        hours: formObject[prefix + '.availability.startTime.hours'],
        minutes: formObject[prefix + '.availability.startTime.minutes'],
      },
      endTime: {
        hours: formObject[prefix + '.availability.endTime.hours'],
        minutes: formObject[prefix + '.availability.endTime.minutes'],
      },
      timeZone: formObject[prefix + '.availability.timezone'],
      startDay: formObject[prefix + '.availability.startDay'],
      endDay: formObject[prefix + '.availability.endDay'],
    });
  }

  return timeObjects;
}

module.exports = router;
