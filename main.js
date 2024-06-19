import axios from 'axios';
import fs from 'fs';
import yargs from 'yargs';

const argv = yargs(process.argv.slice(2))
  .options({
    'api_token': { type: 'string', demandOption: true, alias: 'token' },
    'base_url': { type: 'string', demandOption: true, alias: 'url' }
  })
  .usage('Usage: $0 --api_token [string] --base_url [string]')
  .help()
  .alias('help', 'h')
  .argv;

// Using destructuring to extract the command line arguments
const { api_token, base_url } = argv;


// Base URL for the API
const api = axios.create({
    baseURL: base_url,
    headers: {
        'Authorization': `Token ${api_token}`
    }
});

// Function to fetch the list of projects
async function fetchProjects() {
    try {
        const response = await api.get('/rest/1/?output=project&pretty');
        return response.data.project;
    } catch (error) {
        console.error('Failed to fetch projects:', error);
        throw error;
    }
}

// Function to initiate a report export for a project
async function exportProjectReport(shortLabel) {
    try {
        const response = await api.post(`/rest/1/${shortLabel}/report/export_zip?format=xml`);
        return response.data.jobId;
    } catch (error) {
        console.error('Failed to export project report:', error);
        throw error;
    }
}

// Function to poll job status until completion
async function pollJobStatus(shortLabel, jobId) {
    try {
        let jobComplete = false;
        while (!jobComplete) {
            const response = await api.get(`/rest/1/${shortLabel}/job/${jobId}`);
            const jobData = response.data;
            jobComplete = jobData.progress === 100 && jobData.status === "Done";
            if (!jobComplete) {
                console.log(`Job ${jobId} progress: ${jobData.progress}%. Status: ${jobData.status}. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
            } else {
                console.log(`Job ${jobId} completed! Downloading file...`);
                return jobData.jobFile; // Assuming 'files' field contains file info
            }
        }
    } catch (error) {
        console.error('Failed to poll job status:', error);
        throw error;
    }
}

// Function to download and save the file locally
async function downloadFile(shortLabel, files, projectLabel) {
    const file = files.find(f => f.visibleName === 'export.zip');
    if (!file) {
        console.error('No file named "export.zip" found.');
        return;
    }
    try {
        const response = await api.get(file.restUrl, {
            responseType: 'arraybuffer'
        });
        let today = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(`${today}_${projectLabel}_export.zip`, response.data);
        console.log(`File saved as ${projectLabel}_export.zip`);
    } catch (error) {
        console.error('Failed to download file:', error);
        throw error;
    }
}

// Main function to orchestrate the operations
async function main() {
    try {
        const projects = await fetchProjects();
        for (const project of projects) {
            console.log("#####################") 
            console.log(`Exporting report for project: ${project.label}`);
            const jobId = await exportProjectReport(project.shortLabel);
            console.log(`Polling job status for Job ID: ${jobId}`);
            const files = await pollJobStatus(project.shortLabel, jobId);
            if (files) {
                await downloadFile(project.shortLabel, files, project.label);
            }
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Execute the main function
main();
