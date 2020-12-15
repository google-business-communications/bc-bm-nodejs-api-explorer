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

const TEMPLATE_NON_LOCAL_CONFIG = { // Configuration options for launching on non-local entry points
  // List of phone numbers for call deflection, values must be globally unique
  callDeflectionPhoneNumbers: [
    { number: '' },
  ],
  // Contact information for the agent that displays with the messaging button
  contactOption: {
    options: [
      'WEB_CHAT'
    ],
    url: '',
  },
  // Domains enabled for messaging within Search, values must be globally unique
  enabledDomains: [''],
  // Agent's phone number. Overrides the `phone` field
  // for conversations started from non-local entry points
  phoneNumber: { number: '' },
  regionCodes: ['US']
};

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
      nonLocalConfig: TEMPLATE_NON_LOCAL_CONFIG
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
    apiObject.bcApi.brands.agents.get(apiParams, {}, async function(err, response) {
      console.log(err);
      console.log(response);

      const agent = response.data;

      if (agent.businessMessagesAgent.nonLocalConfig.enabledDomains === undefined) {
        agent.businessMessagesAgent.nonLocalConfig = TEMPLATE_NON_LOCAL_CONFIG;
      }

      let domains = '';
      if (agent.businessMessagesAgent.nonLocalConfig.enabledDomains !== undefined) {
        for (let i = 0; i < agent.businessMessagesAgent.nonLocalConfig.enabledDomains.length; i++) {
          if (i > 0) domains += ', ';

          domains += agent.businessMessagesAgent.nonLocalConfig.enabledDomains[i];
        }
      }
      agent.businessMessagesAgent.nonLocalConfig.enabledDomains = domains;

      let phoneNumbers = '';
      if (agent.businessMessagesAgent.nonLocalConfig.callDeflectionPhoneNumbers !== undefined) {
        for (let i = 0; i < agent.businessMessagesAgent.nonLocalConfig.callDeflectionPhoneNumbers.length; i++) {
          if (i > 0) phoneNumbers += ', ';

          phoneNumbers += agent.businessMessagesAgent.nonLocalConfig.callDeflectionPhoneNumbers[i].number;
        }
      }
      agent.businessMessagesAgent.nonLocalConfig.callDeflectionPhoneNumbers = phoneNumbers;

      let regionCodes = '';
      if (agent.businessMessagesAgent.nonLocalConfig.regionCodes !== undefined) {
        for (let i = 0; i < agent.businessMessagesAgent.nonLocalConfig.regionCodes.length; i++) {
          if (i > 0) regionCodes += ', ';

          regionCodes += agent.businessMessagesAgent.nonLocalConfig.regionCodes[i];
        }
      }
      agent.businessMessagesAgent.nonLocalConfig.regionCodes = regionCodes;

      // Get the agent state
      agent.verificationLaunchState = await getAgentState(agentId, apiObject);

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
 * Gets the verification state for the agent. If the agent is verified,
 * the launch state is retrieved.
 * {string} agentId The agent id to retrieve the state for.
 * {object} apiObject The Business Messages client library object.
 */
async function getAgentState(agentId, apiObject) {
  return new Promise((resolve, reject) => {
    // setup the parameters for the API call
    let apiParams = {
      auth: apiObject.authClient,
      name: agentId + '/verification',
    };

    apiObject.bcApi.brands.agents.getVerification(apiParams, {}, (err, response) => {
      const agentVerification = response.data;

      let agentState = 'VERIFICATION_STATE_UNVERIFIED';

      if (agentVerification.verificationState !== undefined) {
        agentState = agentVerification.verificationState;
      }

      if (agentState === 'VERIFICATION_STATE_VERIFIED') {
        apiParams = {
          auth: apiObject.authClient,
          name: agentId + '/launch',
        };

        // Check the launch status
        apiObject.bcApi.brands.agents.getLaunch(apiParams, {}, (err, response) => {
          const agentLaunch = response.data;

          if (agentLaunch.businessMessages.launchDetails !== undefined) {
            if (agentLaunch.businessMessages.launchDetails.NON_LOCAL !== undefined) {
              agentState = agentLaunch.businessMessages.launchDetails.NON_LOCAL.launchState;
            }
            else if (agentLaunch.businessMessages.launchDetails.LOCATION !== undefined) {
              agentState = agentLaunch.businessMessages.launchDetails.LOCATION.launchState;
            }
          }

          resolve(agentState);
        });
      }
      else {
        resolve(agentState);
      }
    });
  });
}

/**
 * Request agent verification.
 */
router.post('/verify', function(req, res, next) {
  const agentId = req.query.agentId;
  const brandId = req.query.brandId;

  const formObject = req.body;

  const agentVerificationContact = {
    agentVerificationContact: {
      partnerName: formObject.partnerName,
      partnerEmailAddress: formObject.partnerEmailAddress,
      brandContactName: formObject.brandContactName,
      brandContactEmailAddress: formObject.brandContactEmailAddress,
      brandWebsiteUrl: formObject.brandWebsiteUrl,
    },
  };

  const apiConnector = apiHelper.init();
  apiConnector.then((apiObject) => {
    // setup the parameters for the API call
    const apiParams = {
      auth: apiObject.authClient,
      name: agentId,
      resource: agentVerificationContact,
    };

    apiObject.bcApi.brands.agents.requestVerification(apiParams, {}, (err, response) => {
      if (err !== undefined && err !== null) {
        handleError(res, err, brandId, agentId);
      } else {
        res.redirect('/agents/edit?brandId=' + brandId + '&agentId=' + agentId);
      }
    });
  });
});

/**
 * Request agent launch.
 */
router.get('/launch', function(req, res, next) {
  const agentId = req.query.agentId;
  const brandId = req.query.brandId;

  // Get the agent first so we know what regions to launch with
  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // setup the parameters for the API call
    const apiParams = {
      auth: apiObject.authClient,
      name: agentId,
    };

    console.log(apiParams);

    apiObject.bcApi.brands.agents.get(apiParams, {}, function(err, response) {
      console.log(err);
      console.log(response);

      const agent = response.data;

      const agentLaunch = {
        agentLaunch: {
          businessMessages: {
            launchDetails: {
              'NON_LOCAL': {
                'entryPoint': 'NON_LOCAL',
                'regionCodes': agent.businessMessagesAgent.nonLocalConfig.regionCodes,
              },
              'LOCATION': {
                'entryPoint': 'LOCATION',
              },
            }
          },
        }
      };

      // setup the parameters for the API call
      const apiParams = {
        auth: apiObject.authClient,
        name: agentId,
        resource: agentLaunch,
      };

      apiObject.bcApi.brands.agents.requestLaunch(apiParams, {}, (err, response) => {
        console.dir(err);
        console.dir(response);

        if (err !== undefined && err !== null) {
          handleError(res, err, brandId, agentId);
        } else {
          res.redirect('/agents/edit?brandId=' + brandId + '&agentId=' + agentId);
        }
      });
    });
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
          allowedEntryPoint: 'LOCATION'
        },
        {
          allowedEntryPoint: 'NON_LOCAL'
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

  agentObject.businessMessagesAgent.nonLocalConfig = getNonLocalConfig(formObject);

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
 * Parses the form key/value pairs into an object
 * for the non local configuration of an agent.
 *
 * @param {object} formObject Key/value pairs from the HTML form.
 * @return Non local configuration object.
 */
function getNonLocalConfig(formObject) {
  let nonLocalConfig = {};

  nonLocalConfig.phoneNumber = { number: formObject['nonLocalConfig.phoneNumber.number'] };
  nonLocalConfig.contactOption = {
    url: formObject['nonLocalConfig.contactOption.url'],
    options: [ formObject['nonLocalConfig.contactOption.option'] ]
  };

  nonLocalConfig.enabledDomains = [];
  let domains = formObject['nonLocalConfig.enabledDomains'].split(',');
  for(let i = 0; i < domains.length; i++) {
    nonLocalConfig.enabledDomains.push(domains[i].trim());
  }

  nonLocalConfig.callDeflectionPhoneNumbers = [];
  let phoneNumbers = formObject['nonLocalConfig.callDeflectionPhoneNumbers'].split(',');
  for(let i = 0; i < phoneNumbers.length; i++) {
    nonLocalConfig.callDeflectionPhoneNumbers.push({ number: phoneNumbers[i].trim() });
  }

  nonLocalConfig.regionCodes = [];
  let regionCodes = formObject['nonLocalConfig.regionCodes'].split(',');
  for(let i = 0; i < regionCodes.length; i++) {
    nonLocalConfig.regionCodes.push(regionCodes[i].trim());
  }

  return nonLocalConfig;
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
