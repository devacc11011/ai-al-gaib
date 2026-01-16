#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Orchestrator } from '../orchestrator/Orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();
const orchestrator = new Orchestrator();

// Package version loading
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

program
  .name('ai-al-gaib')
  .description('Multi-Agent AI Orchestration System')
  .version(packageJson.version);

program
  .command('plan')
  .description('Plan a task using AI agents')
  .argument('<task>', 'The task description')
  .option('-p, --planner <agent>', 'Specify the planner agent (claude, codex, gemini)', 'claude')
  .option('-e, --executor <agent>', 'Specify the executor agent (claude, codex, gemini)', 'claude')
  .option('-r, --run', 'Immediately execute the plan after creation')
  .action(async (task, options) => {
    try {
      console.log(chalk.gray(`Planner: ${options.planner}, Executor: ${options.executor}`));
      if (options.run) {
        console.log(chalk.cyan('Planning and Executing task:'), task);
        await orchestrator.runFullFlow(task, { planner: options.planner, executor: options.executor });
      } else {
        console.log(chalk.cyan('Planning task:'), task);
        await orchestrator.planTask(task, { planner: options.planner, executor: options.executor });
        console.log(chalk.yellow('\nTip: Use --run to execute immediately.'));
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('execute')
  .description('Execute a planned task')
  .argument('<plan-id>', 'The ID of the plan to execute')
  .option('-e, --executor <agent>', 'Specify the default executor agent')
  .action(async (planId, options) => {
    try {
      console.log(chalk.green('Executing plan:'), planId);
      await orchestrator.executePlan(planId);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program.parse();