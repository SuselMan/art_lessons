import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
if(!process.env.APP_URL)throw Error('verified QA runtime APP_URL required')
export default defineConfig({testDir:resolve(__dirname,'../../e2e/specs'),testMatch:'rapidWatercolorUndo.spec.ts',workers:1,retries:0,timeout:180000,reporter:[['list']],outputDir:resolve(__dirname,'rapid-undo-results'),use:{baseURL:process.env.APP_URL,viewport:{width:1400,height:900},ignoreHTTPSErrors:true,trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{channel:'chrome',headless:false,args:['--ignore-certificate-errors']}}})
