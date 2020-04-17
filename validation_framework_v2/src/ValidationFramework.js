import React from 'react';
import CssBaseline from '@material-ui/core/CssBaseline';
import Container from '@material-ui/core/Container';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import SettingsIcon from '@material-ui/icons/Settings';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import axios from 'axios';
import _ from 'lodash';

import ModelTable from "./ModelTable";
import TestTable from "./TestTable";
import ModelDetail from "./ModelDetail";
import TestDetail from "./TestDetail";
import ConfigForm from "./ConfigForm";
import Introduction from "./Introduction";
import ConfigDisplayTop from "./ConfigDisplayTop"
import LoadingIndicator from "./LoadingIndicator"
import ResultDetail from './ResultDetail';
import ErrorDialog from './ErrorDialog';
import { DevMode, baseUrl, collaboratoryOrigin, updateSettingsTopic, isFramedApp, settingsDelimiter, filterKeys, displayValid, queryValid, updateHash } from "./globals";
import { isUUID } from './utils'

// if working on the appearance/layout set globals.DevMode=true
// to avoid loading the models and tests over the network every time;
// instead we use the local test_data
var test_data = {}
if (DevMode) {
  test_data = require('./dev_data/test_data.json');
} else {
  test_data = {models: [], tests: []};
}

const buildQuery = (filterDict) => {
  let q = "";
  for (var key in filterDict) {
    for (var value of filterDict[key]) {
      q += `&${key}=${value}`
    }
  }
  return q.slice(1);
};

const filtersEmpty = (filterDict) => {
  // return true if no filters are set
  let is_empty = true;
  for (var key in filterDict) {
    if (filterDict[key].length > 0) {
      is_empty = false;
    }
  };
  return is_empty;
};

const storeFilters = (filterDict) => {
  if (isFramedApp) {
    let data = {};
    for (let key of filterKeys) {
      data[key] = filterDict[key].join(settingsDelimiter);
    }
    data["reload"] = false;
    window.parent.postMessage(
      {
        topic: updateSettingsTopic,
        data: data
      },
      collaboratoryOrigin);
    console.log("Stored filter settings");
  }
};

const storeDisplay = (display) => {
  if (isFramedApp) {
    let data = {};
    data["display"] = display;
    data["reload"] = false;
    window.parent.postMessage(
      {
        topic: updateSettingsTopic,
        data: data
      },
      collaboratoryOrigin);
    console.log("Stored display settings");
  }
};

const retrieveFilters = () => {
  const searchParams = new URLSearchParams(window.location.search);

  let filters = {};
  for (let key of filterKeys) {
    let param = searchParams.get(key);
    if (param) {
      filters[key] = param.split(settingsDelimiter);
    } else {
      filters[key] = [];
    }
  }
  return filters;
}

const retrieveDisplay = () => {
  const searchParams = new URLSearchParams(window.location.search);
  let param = searchParams.get("display");
  if (displayValid.includes(param)) {
    return param;
  } else {
    return displayValid[1]; //"Models & Tests"
  }
}

export default class ValidationFramework extends React.Component {
  signal = axios.CancelToken.source();

  constructor(props) {
    super(props);

    this.state = {
      'modelData': [],
      'testData': [],
      'currentModel': null,
      'currentTest': null,
      'currentResult': null,
      'modelDetailOpen': false,
      'testDetailOpen': false,
      'resultDetailOpen': false,
      'configOpen': false,
      'loading_model': true,
      'loading_test': true,
      'errorUpdate': null,
      'errorGet': null,
      'filters': retrieveFilters(),
      'display': retrieveDisplay(),
      'modelsTableWide': false,
      'testsTableWide': false
    };
    if (DevMode) {
      this.state['modelData'] = test_data.models
      this.state['currentModel'] = test_data.models[0]
      this.state['testData'] = test_data.tests
      this.state['currentTest'] = test_data.tests[0]
      this.state['loading_model'] = false
      this.state['loading_test'] = false
    }
    this.handleModelDetailClose = this.handleModelDetailClose.bind(this);
    this.handleTestDetailClose = this.handleTestDetailClose.bind(this);
    this.handleResultDetailClose = this.handleResultDetailClose.bind(this);
    this.handleModelRowClick = this.handleModelRowClick.bind(this);
    this.handleTestRowClick = this.handleTestRowClick.bind(this);
    this.openConfig = this.openConfig.bind(this);
    this.handleConfigClose = this.handleConfigClose.bind(this);
    this.handleErrorGetDialogClose = this.handleErrorGetDialogClose.bind(this);
    this.handleErrorUpdateDialogClose = this.handleErrorUpdateDialogClose.bind(this);
    this.updateModels = this.updateModels.bind(this);
    this.updateTests = this.updateTests.bind(this);
    this.getModel = this.getModel.bind(this);
    this.getTest = this.getTest.bind(this);
    this.modelTableFullWidth = this.modelTableFullWidth.bind(this);
    this.testTableFullWidth = this.testTableFullWidth.bind(this);
  }

  modelTableFullWidth() {
    this.setState({
      modelsTableWide: !this.state.modelsTableWide
    });
  }

  testTableFullWidth() {
    this.setState({
      testsTableWide: !this.state.testsTableWide
    });
  }

  componentDidMount() {
    if (window.location.hash) {
      let proceed = true;
      const param = window.location.hash.slice(1);
      const key = param.split(".")[0]
      const value = param.substr(param.indexOf('.')+1)
      let error_message = ""

      if (!queryValid.includes(key)) {
        error_message = "URL query parameter must be one of the following:\n" + queryValid.join(", ");
        this.setState({errorGet: error_message});
        proceed = false;
      }
      if(proceed && key.endsWith("_id") && !isUUID(value)) {
        error_message = "Value for query parameter '" + key + "' is not a valid UUID.\n Value: (" + value + ")";
        this.setState({errorGet: error_message});
        proceed = false;
      }

      if(proceed && key.startsWith("model")) {
        // get a specific model
        this.getModel(key, value);
      } else if(proceed && key.startsWith("test")) {
        // get a specific test
        this.getTest(key, value);
      } else if(proceed && key === "result_id") {
        // get a specific result
        this.getResult(key, value);
      }
    }
    if (!DevMode) {
      if (this.state.display!=="Only Tests") {
        this.updateModels(this.state.filters);
      }
      if (this.state.display!=="Only Models") {
        this.updateTests(this.state.filters);
      }
    }
  }

  componentWillUnmount() {
    this.signal.cancel('REST API call canceled!');
  }

  getModel(key, value) {
    let url = "";
    if (key === "model_id") {
      url = baseUrl + "/models/?id=" + value;
    } else if (key === "model_alias") {
      url = baseUrl + "/models/?alias=" + value;
    }
    let config = {
      cancelToken: this.signal.token,
      headers: {
        'Authorization': 'Bearer ' + this.props.auth.token,
      }
    }
    // this.setState({loading_model: true});
    axios.get(url, config)
      .then(res => {
        if(res.data.models.length !== 1) {
          throw "Specified model_alias = '" + value + "' does not exist!";
        }
        this.setState({
          currentModel: res.data.models[0],
          // loading_model: false,
          errorGet: null,
          modelDetailOpen: true
        });
      })
      .catch(err => {
        if (axios.isCancel(err)) {
          console.log('errorGet: ', err.message);
        } else {
          // Something went wrong. Save the error in state and re-render.
          this.setState({
            // loading_model: false,
            errorGet: "Specified model_id = '" + value + "' is invalid!"
          });
        }
      }
    );
  };

  getTest(key, value) {
    let url = "";
    if (key === "test_id") {
      url = baseUrl + "/tests/?id=" + value;
    } else if (key === "test_alias") {
      url = baseUrl + "/tests/?alias=" + value;
    }
    let config = {
      cancelToken: this.signal.token,
      headers: {
        'Authorization': 'Bearer ' + this.props.auth.token,
      }
    }
    // this.setState({loading_test: true});
    axios.get(url, config)
      .then(res =>   {
        if(res.data.tests.length !== 1) {
          throw "Specified test_alias = '" + value + "' does not exist!";
        }
        this.setState({
          currentTest: res.data.tests[0],
          // loading_test: false,
          errorGet: null,
          testDetailOpen: true
        });
      })
      .catch(err => {
        if (axios.isCancel(err)) {
          console.log('errorGet: ', err.message);
        } else {
          // Something went wrong. Save the error in state and re-render.
          this.setState({
            // loading_test: false,
            errorGet: "Specified test_id = '" + value + "' is invalid!"
          });
        }
      }
    );
  };

  getResult(key, value) {
    let url = baseUrl + "/results/?order=&id=" + value;
    let config = {
      cancelToken: this.signal.token,
      headers: {
        'Authorization': 'Bearer ' + this.props.auth.token,
      }
    }
    return axios.get(url, config)
      .then(res => {
        if(res.data.results.length !== 1) {
          throw "Specified result_id = '" + value + "' is invalid!"
        }
        this.setState({
          currentResult: res.data["results"][0],
          // loading_result: false,
          errorGet: null,
          resultDetailOpen: true
        });
      })
      .catch(err => {
        if (axios.isCancel(err)) {
          console.log('errorGet: ', err.message);
        } else {
          // Something went wrong. Save the error in state and re-render.
          this.setState({
            // loading_result: false,
            errorGet: err
          });
        }
      }
    );
  };

  updateModels(filters) {
    if (filtersEmpty(filters) && isFramedApp) { // TODO: remove `isFramedApp` to avoid auto load of all entries on entry page-
      this.setState({
        modelData: [],
        loading_model: false,
        errorUpdate: null
      });
    } else {
      let query = buildQuery(filters);
      let config = {
        cancelToken: this.signal.token,
        headers: {
          'Authorization': 'Bearer ' + this.props.auth.token,
        }
      }
      let url = baseUrl + "/models/?" + query;
      this.setState({loading_model: true});
      axios.get(url, config)
        .then(res => {
          const models = res.data.models;
          this.setState({
            modelData: models,
            // currentModel: this.state.currentModel ? this.state.currentModel : models[0], //Remove?
            loading_model: false,
            errorUpdate: null
          });
        })
        .catch(err => {
          if (axios.isCancel(err)) {
            console.log('errorUpdate: ', err.message);
          } else {
            // Something went wrong. Save the error in state and re-render.
            this.setState({
              loading_model: false,
              errorUpdate: err
            });
          }
        }
      );
    };
  };

  updateTests(filters) {
    if (filtersEmpty(filters) && isFramedApp) { // TODO: remove `isFramedApp` to avoid auto load of all entries on entry page
      this.setState({
        testData: [],
        loading_test: false,
        errorUpdate: null
      });
    } else {
      let query = buildQuery(filters);
      let config = {
        cancelToken: this.signal.token,
        headers: {
          'Authorization': 'Bearer ' + this.props.auth.token,
        }
      }
      let url = baseUrl + "/tests/?" + query;
      this.setState({loading_test: true});
      axios.get(url, config)
        .then(res => {
          const tests = res.data.tests;
          this.setState({
            testData: tests,
            // currentTest: this.state.currentTest ? this.state.currentTest : tests[0], //Remove?
            loading_test: false,
            errorUpdate: null
          });
        })
        .catch(err => {
          if (axios.isCancel(err)) {
            console.log('errorUpdate: ', err.message);
          } else {
            // Something went wrong. Save the error in state and re-render.
            this.setState({
              loading_test: false,
              errorUpdate: err
            });
          }
        }
      );
    };
  };

  handleModelRowClick(rowData, rowMeta) {
    // Note: last element of MUIDataTable (in ModelTable.js) is set to json Object of entry
    this.setState({'currentModel': rowData[rowData.length-1]});
    this.setState({'modelDetailOpen': true});
    updateHash("model_id."+rowData[0]);
  };

  handleModelDetailClose() {
    this.setState({'currentModel': null});
    this.setState({'modelDetailOpen': false});
    updateHash('');
  };

  handleTestRowClick(rowData, rowMeta) {
    // Note: last element of MUIDataTable (in TestTable.js) is set to json Object of entry
    this.setState({'currentTest': rowData[rowData.length-1]});
    this.setState({'testDetailOpen': true});
    updateHash("test_id."+rowData[0]);
  };

  handleTestDetailClose() {
    this.setState({'currentTest': null});
    this.setState({'testDetailOpen': false});
    updateHash('');
  };

  handleResultDetailClose() {
    this.setState({'currentResult': null});
    this.setState({'resultDetailOpen': false});
    updateHash('');
  };

  openConfig() {
    this.setState({'configOpen': true})
  };

  handleConfigClose(display, filters) {
    let update_flag = false;
    if(!_.isEqual(filters, this.state.filters)) {
      this.setState({'filters': filters});
      storeFilters(filters);
      // if running within the Collaboratory, this reloads the page, so the filters get applied on the reload
      // when accessed stand-alone, the filters are not stored, and the following lines are executed
      if (display!=="Only Tests") {
        update_flag = true;
        this.updateModels(filters);
      }
      if (display!=="Only Models") {
        update_flag = true;
        this.updateTests(filters);
      }
    }
    if(display !== this.state.display) { // compare new with existing
      console.log(this.state.display)
      console.log(display)
      if ((!update_flag) && (this.state.display === "Only Tests")) {
        this.updateModels(filters);
      }
      if ((!update_flag) && (this.state.display === "Only Models")) {
        this.updateTests(filters);
      }
      storeDisplay(display);
      this.setState({'display': display});
      this.setState({modelsTableWide: false});
      this.setState({testsTableWide: false});
    }
    this.setState({'configOpen': false});
  };

  handleErrorGetDialogClose() {
    this.setState({'errorGet': null});
  };

  handleErrorUpdateDialogClose() {
    this.setState({'errorUpdate': null});
  };

  renderError() {
    return (
      <div>
        Uh oh: {this.state.error.message}
      </div>
    );
  };

  renderTables() {
    let content = "";
    if ((this.state.modelsTableWide && !this.state.testsTableWide) || (this.state.display==="Only Models")) {
      content = <Grid container>
                  <Grid item xs={12}>
                    { this.state.loading_model ?
                    <Paper style={{padding: '0 0 0 16px'}}>
                      <br />
                      <Typography variant="h6">Models</Typography>
                      <LoadingIndicator />
                      <br /><br />
                    </Paper>
                    :
                    <ModelTable rows={this.state.modelData} display={this.state.display} changeTableWidth={this.modelTableFullWidth} handleRowClick={this.handleModelRowClick} />
                    }
                  </Grid>
                </Grid>
    } else if ((!this.state.modelsTableWide && this.state.testsTableWide) || (this.state.display==="Only Tests")) {
      content = <Grid container>
                  <Grid item xs={12}>
                    { this.state.loading_test ?
                      <Paper style={{padding: '0 0 0 16px'}}>
                        <br />
                        <Typography variant="h6">Tests</Typography>
                        <LoadingIndicator />
                        <br /><br />
                      </Paper>
                      :
                      <TestTable rows={this.state.testData} display={this.state.display} changeTableWidth={this.testTableFullWidth}  handleRowClick={this.handleTestRowClick} />
                    }
                  </Grid>
                </Grid>
    } else {
      content = <Grid container spacing={2}>
                  <Grid item xs={6}>
                    { this.state.loading_model ?
                      <Paper style={{padding: '0 0 0 16px'}}>
                        <br />
                        <Typography variant="h6">Models</Typography>
                        <LoadingIndicator />
                        <br /><br />
                      </Paper>
                      :
                      <ModelTable rows={this.state.modelData} display={this.state.display} changeTableWidth={this.modelTableFullWidth} handleRowClick={this.handleModelRowClick} />
                    }
                  </Grid>
                  <Grid item xs={6}>
                    { this.state.loading_test ?
                      <Paper style={{padding: '0 0 0 16px'}}>
                        <br />
                        <Typography variant="h6">Tests</Typography>
                        <LoadingIndicator />
                        <br /><br />
                      </Paper>
                      :
                      <TestTable rows={this.state.testData} display={this.state.display} changeTableWidth={this.testTableFullWidth} handleRowClick={this.handleTestRowClick} />
                    }
                  </Grid>
                </Grid>
    }
    return(
      <div>
        {content}
      </div>
      );
  }

  renderValidationFramework() {
    var configContent = "";
    var mainContent = "";
    var modelDetail = "";
    var testDetail = "";
    var resultDetail = "";

    if (this.state.errorGet) {
      return <ErrorDialog open={Boolean(this.state.errorGet)} handleErrorDialogClose={this.handleErrorGetDialogClose} error={this.state.errorGet.message || this.state.errorGet} />
    }
    if (this.state.errorUpdate) {
      return <ErrorDialog open={Boolean(this.state.errorUpdate)} handleErrorDialogClose={this.handleErrorUpdateDialogClose} error={this.state.errorUpdate.message || this.state.errorUpdate} />
    }
    if (filtersEmpty(this.state.filters) && isFramedApp) { // TODO: remove `isFramedApp` to avoid auto load of all entries on entry page
      configContent = "";
      mainContent = <Introduction />;
    } else {
      configContent = <ConfigDisplayTop filters={this.state.filters} />
      mainContent = this.renderTables();
    }

    if (this.state.currentModel) {// && this.state.display!=="Only Tests") {
      modelDetail = <ModelDetail open={this.state.modelDetailOpen} modelData={this.state.currentModel} onClose={this.handleModelDetailClose} auth={this.props.auth} />;
    } else {
      modelDetail = "";
    }

    if (this.state.currentTest) {// && this.state.display!=="Only Models") {
      testDetail = <TestDetail open={this.state.testDetailOpen} testData={this.state.currentTest} onClose={this.handleTestDetailClose} auth={this.props.auth} />;
    } else {
      testDetail = "";
    }

    if (this.state.currentResult) {
      resultDetail = <ResultDetail open={this.state.resultDetailOpen} result={this.state.currentResult} onClose={this.handleResultDetailClose} auth={this.props.auth} />;
    } else {
      resultDetail = "";
    }

    return (
      <React.Fragment>
        <Grid container direction="row">
          <Grid item xs={1}>
          <IconButton onClick={this.openConfig} aria-label="Configure filters">
              <SettingsIcon />
            </IconButton>
          </Grid>
          <Grid item xs={11}>
          {configContent}
          </Grid>
        </Grid>
        <br/>

        <ConfigForm open={this.state.configOpen} onClose={this.handleConfigClose} config={this.state.filters} display={this.state.display} />
        <div>
          {modelDetail}
        </div>
        <div>
          {testDetail}
        </div>
        <div>
          {resultDetail}
        </div>
        <main>
          {mainContent}
        </main>
      </React.Fragment>
    );
  };

  render() {
    return (
      <React.Fragment>
        <CssBaseline />
        <Container maxWidth="xl">
          {this.renderValidationFramework()}
        </Container>
      </React.Fragment>
    );
  }
}
