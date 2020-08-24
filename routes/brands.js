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

/**
 * Brand listing page.
 */
router.get('/', function(req, res, next) {
  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // setup the parameters for the API call
    const apiParams = {
      auth: apiObject.authClient,
    };

    // send the client the message
    apiObject.bcApi.brands.list(apiParams, {}, function(err, response) {
      let brands = [];
      if (response.data != undefined) {
        brands = response.data.brands;
      }
      res.render('brands/list', {brands: brands});
    });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create a new brand page.
 */
router.get('/create', function(req, res, next) {
  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  res.render('brands/edit',
      {title: 'Create Brand', formUrl: '/brands/save', message: message},
  );
});

/**
 * Edit an existing brand page.
 */
router.get('/edit', function(req, res, next) {
  const brandId = req.query.brandId;

  let message = '';
  if (req.query.message !== undefined) {
    message = req.query.message;
  }

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    const apiParams = {
      auth: apiObject.authClient,
      name: brandId,
    };

    apiObject.bcApi.brands.get(apiParams, {}, function(err, response) {
      console.log(err);

      res.render('brands/edit',
          {
            brand: response.data,
            title: 'Edit Brand',
            formUrl: '/brands/save?brandId=' + brandId,
            message: message,
          });
    });
  }).catch(function(err) {
    console.log(err);
  });
});

/**
 * Create/update a brand.
 */
router.post('/save', function(req, res, next) {
  let brandId = false;
  if (req.query.brandId !== undefined) {
    brandId = req.query.brandId;
  }

  const brandObject = {
    displayName: req.body.displayName,
  };

  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // Update brand
    if (brandId) {
      updateBrand(res, brandId, brandObject, apiObject);
    } else { // Create brand
      createBrand(res, brandObject, apiObject);
    }
  });
});

/**
 * Patches the brand's name. If there are no errors,
 * the user is redirected to the list of all brands.
 *
 * @param {object} res The HTTP response object.
 * @param {string} brandId The brand id being patched.
 * @param {object} brandObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function updateBrand(res, brandId, brandObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    name: brandId,
    resource: brandObject,
    updateMask: 'displayName',
  };

  apiObject.bcApi.brands.patch(apiParams, {}, function(err, response) {
    if (err !== undefined && err !== null) {
      handleError(res, err, brandId, locationId);
    } else {
      res.redirect('/');
    }
  });
}

/**
 * Creates a new brand. If there are no errors,
 * the user is redirected to the list of all brands.
 *
 * @param {object} res The HTTP response object.
 * @param {object} brandObject The JSON object to post.
 * @param {object} apiObject The BC API object.
 */
function createBrand(res, brandObject, apiObject) {
  // setup the parameters for the API call
  const apiParams = {
    auth: apiObject.authClient,
    resource: brandObject,
  };

  apiObject.bcApi.brands.create(apiParams, {}, function(err, response) {
    if (err !== undefined && err !== null) {
      handleError(res, err);
    } else {
      res.redirect('/');
    }
  });
}

/**
 * Parses the error and redirects to display the error message.
 *
 * @param {object} res The HTTP response object.
 * @param {object} error The error object.
 * @param {string} brandId The brand id.
 * @param {object} apiObject The BC API object.
 */
function handleError(res, error, brandId) {
  console.log(util.inspect(error, {showHidden: false, depth: null}));

  const errorMessage = error.errors[0].message;

  let url = '/brands/edit?brandId=' + brandId + '&message=' + errorMessage;
  if (brandId === undefined) {
    url = '/brands/create?message=' + errorMessage;
  }

  res.redirect(url);
}

module.exports = router;
