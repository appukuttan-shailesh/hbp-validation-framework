import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import MuiDialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import Dialog from '@material-ui/core/Dialog';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Box from '@material-ui/core/Box';
import Theme from './theme';

import axios from 'axios';

import TestDetailHeader from './TestDetailHeader';
import TestDetailContent from './TestDetailContent';
import TestDetailMetadata from './TestDetailMetadata';
import TestResultOverview from './TestResultOverview';
import { formatAuthors } from "./utils";
import ResultGraphs from './ResultGraphs';
import { DevMode } from "./globals";
import { baseUrl } from "./globals";

// if working on the appearance/layout set globals.DevMode=true
// to avoid loading the models and tests over the network every time;
// instead we use the local test_data
var result_data = {}
if (DevMode) {
	result_data = require('./dev_data/sample_test_results.json');
}

const styles = theme => ({
	root: {
		margin: 0,
		padding: theme.spacing(2),
	},
	closeButton: {
		position: 'absolute',
		right: theme.spacing(1),
		top: theme.spacing(1),
		color: theme.palette.grey[500],
	},
});

function TabPanel(props) {
	const { children, value, index, ...other } = props;

	return (
		<Typography
			component="div"
			role="tabpanel"
			hidden={value !== index}
			id={`simple-tabpanel-${index}`}
			aria-labelledby={`simple-tab-${index}`}
			{...other}
		>
			{value === index && <Box p={3}>{children}</Box>}
		</Typography>
	);
}

TabPanel.propTypes = {
	children: PropTypes.node,
	index: PropTypes.any.isRequired,
	value: PropTypes.any.isRequired,
};

const MyDialogTitle = withStyles(styles)(props => {
	const { children, classes, onClose, ...other } = props;
	return (
		<MuiDialogTitle disableTypography className={classes.root} {...other}>
			<Typography variant="h6">{children}</Typography>
			{onClose ? (
				<IconButton aria-label="close" className={classes.closeButton} onClick={onClose}>
					<CloseIcon />
				</IconButton>
			) : null}
		</MuiDialogTitle>
	);
});


export default class TestDetail extends React.Component {
	signal = axios.CancelToken.source();

	constructor(props) {
		super(props);
		this.state = {
			tabValue: 0,
			results: [],
			loadingResult: true,
			error: null,
			testData: this.props.testData
		};
		if (DevMode) {
			this.state['results'] = result_data.results;
			this.state['loadingResult'] = false;
		}
		this.updateCurrentTestData = this.updateCurrentTestData.bind(this);
		this.handleClose = this.handleClose.bind(this);
		this.handleTabChange = this.handleTabChange.bind(this);
	}

	componentDidMount() {
		if (!DevMode) {
			this.getTestResults();
		}
	}

	componentWillUnmount() {
		this.signal.cancel('REST API call canceled!');
	}

	updateCurrentTestData(updatedTestData) {
		this.setState({
			testData: updatedTestData
		})
	}

	handleClose() {
		this.props.onClose();
	}

	handleTabChange(event, newValue) {
		this.setState({ tabValue: newValue })
	}

	getTestResults = () => {
		let url = baseUrl + "/results/?order=&test_id=" + this.props.testData.id;
		let config = {
			cancelToken: this.signal.token,
			headers: {
				'Authorization': 'Bearer ' + this.props.auth.token,
			}
		}
		return axios.get(url, config)
			.then(res => {
				this.setState({
					results: res.data["results"],
					loadingResult: false,
					error: null
				});
			})
			.catch(err => {
				if (axios.isCancel(err)) {
					console.log('Error: ', err.message);
				} else {
					// Something went wrong. Save the error in state and re-render.
					this.setState({
						loadingResult: false,
						error: err
					});
				}
			}
			);
	};

	render() {
		console.log(this.state.testData)
		return (
			<Dialog fullScreen onClose={this.handleClose} aria-labelledby="simple-dialog-title" open={this.props.open}>
				<MyDialogTitle onClose={this.handleClose} />
				<DialogContent>
					<Grid container spacing={3}>

						<TestDetailHeader
							name={this.state.testData.name}
							authors={formatAuthors(this.state.testData.author)}
							id={this.state.testData.id}
							alias={this.state.testData.alias}
							creationDate={this.state.testData.creation_date}
							status={this.state.testData.status}
							testData={this.state.testData}
							updateCurrentTestData={this.updateCurrentTestData}
						></TestDetailHeader>
						<AppBar position="static">
							<Tabs value={this.state.tabValue} onChange={this.handleTabChange}
								style={{ backgroundColor: Theme.tableRowSelectColor, color: Theme.textPrimary }} >
								<Tab label="Info" />
								<Tab label="Results" />
								<Tab label="Figures" />
							</Tabs>
						</AppBar>
						<TabPanel value={this.state.tabValue} index={0}>
							<Grid container spacing={2}>
								<Grid item xs={9}>
									<TestDetailContent
										dataLocation={this.state.testData.data_location}
										protocol={this.state.testData.protocol}
										instances={this.state.testData.codes}
										id={this.state.testData.id}
										results={this.state.results}
									></TestDetailContent>
								</Grid>
								<Grid item xs={3}>
									<TestDetailMetadata
										species={this.state.testData.species}
										brainRegion={this.state.testData.brain_region}
										cellType={this.state.testData.cell_type}
										dataModality={this.state.testData.data_modality}
										dataType={this.state.testData.data_type}
										testType={this.state.testData.test_type}
										scoreType={this.state.testData.score_type}
									>
										<ul>
											<li>{this.state.testData.id}</li>
											<li>{this.state.testData.alias}</li>
										</ul>
									</TestDetailMetadata>
								</Grid>
							</Grid>
						</TabPanel>
						<TabPanel value={this.state.tabValue} index={1}>
							<TestResultOverview
								id={this.state.testData.id}
								testJSON={this.state.testData}
								results={this.state.results}
								loadingResult={this.state.loadingResult}
							/>
						</TabPanel>
						<TabPanel value={this.state.tabValue} index={2}>
							<ResultGraphs
								id={this.state.testData.id}
								results={this.state.results}
								loadingResult={this.state.loadingResult}
							/>
						</TabPanel>
					</Grid>
				</DialogContent>
			</Dialog>
		);
	}
}

TestDetail.propTypes = {
	onClose: PropTypes.func.isRequired,
	open: PropTypes.bool.isRequired
};

// {
//   "alias" : "Test_2019-12-18_15:50:45_integration_py3.7.2_getValTest_1",
//   "author" : [ … ],
//   "brain_region" : "basal ganglia",
//   "cell_type" : "granule cell",
//   "codes" : [ … ],
//   "creation_date" : "2019-12-18T14:50:47.764970",
//   "data_location" : "https://object.cscs.ch/v1/AUTH_c0a333ecf7c045809321ce9d9ecdfdea/sp6_validation_data/test.txt",
//   "data_modality" : "electron microscopy",
//   "data_type" : "Mean, SD",
//   "id" : "005bb12c-9271-4385-a024-87b079dd1db4",
//   "name" : "IGNORE - Test Test - Test_2019-12-18_15:50:45_integration_py3.7.2_getValTest_1",
//   "old_uuid" : null,
//   "protocol" : "Later",
//   "score_type" : "Other",
//   "species" : "Mus musculus",
//   "status" : "proposal",
//   "test_type" : "network structure",
//   "uri" : "https://nexus.humanbrainproject.org/v0/data/modelvalidation/simulation/validationtestdefinition/v0.1.0/005bb12c-9271-4385-a024-87b079dd1db4"
// }
