import { defineConfig } from '@playwright/test'
import base from '../playwright.config'
const label=process.env.QA_RUN_LABEL ?? 'qa-latest'
export default defineConfig({...base, testDir:'../e2e/specs', globalTeardown:undefined, webServer:undefined, use:{...base.use, baseURL:'https://localhost:5288',ignoreHTTPSErrors:true}, projects:[{name:'qa-chrome',use:{...base.projects![0].use,channel:'chrome',headless:false,launchOptions:{...base.projects![0].use?.launchOptions,args:[...(base.projects![0].use?.launchOptions?.args??[]),'--ignore-certificate-errors']}}}],reporter:[['list'],['json',{outputFile:`../temp/device-runs/qa-2026-10-02/${label}-e2e.json`}]],outputDir:`../temp/device-runs/qa-2026-10-02/${label}-artifacts`})
