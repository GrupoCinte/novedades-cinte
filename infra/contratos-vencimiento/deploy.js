/**
 * Deploy AUT-319: Lambda de procesamiento + EventBridge 08:00 Bogotá.
 * Uso: node infra/contratos-vencimiento/deploy.js
 * Env: AWS_*, API_BASE_URL, CONTRATOS_VENCIMIENTO_TOKEN, SES_FROM_EMAIL
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
    LambdaClient,
    CreateFunctionCommand,
    UpdateFunctionCodeCommand,
    UpdateFunctionConfigurationCommand,
    GetFunctionCommand,
    AddPermissionCommand
} = require('@aws-sdk/client-lambda');
const {
    IAMClient,
    CreateRoleCommand,
    GetRoleCommand,
    AttachRolePolicyCommand,
    PutRolePolicyCommand
} = require('@aws-sdk/client-iam');
const {
    SchedulerClient,
    CreateScheduleCommand,
    UpdateScheduleCommand,
    GetScheduleCommand
} = require('@aws-sdk/client-scheduler');

const ROOT = path.join(__dirname, '../..');
const REGION = 'us-east-1';
const PREFIX = 'contratos-vencimiento';
const FN_NAME = `${PREFIX}-processor`;
const ROLE_NAME = `${PREFIX}-lambda-role`;
const SCHEDULE_NAME = `${PREFIX}-daily-bogota`;
const SCHEDULE_GROUP = 'default';

function loadEnv() {
    const p = path.join(ROOT, '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (!m) continue;
        const k = m[1].trim();
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
    }
}

function zipLambda() {
    const srcDir = path.join(ROOT, 'lambda', PREFIX);
    const outZip = path.join(ROOT, 'logs', `${PREFIX}.zip`);
    const work = path.join(ROOT, 'logs', `${PREFIX}-pack`);
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    fs.copyFileSync(path.join(srcDir, 'index.js'), path.join(work, 'index.js'));
    fs.copyFileSync(path.join(srcDir, 'email.js'), path.join(work, 'email.js'));
    if (!fs.existsSync(path.join(srcDir, 'node_modules', '@aws-sdk'))) {
        execSync('npm install --omit=dev', { cwd: srcDir, stdio: 'inherit' });
    }
    execSync(
        `robocopy "${path.join(srcDir, 'node_modules')}" "${path.join(work, 'node_modules')}" /E /NFL /NDL /NJH /NJS /nc /ns /np`,
        { stdio: 'ignore', shell: true }
    );
    fs.copyFileSync(path.join(srcDir, 'package.json'), path.join(work, 'package.json'));
    fs.rmSync(outZip, { force: true });
    execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path '${work}\\*' -DestinationPath '${outZip}' -Force"`,
        { stdio: 'inherit' }
    );
    if (!fs.existsSync(outZip)) throw new Error(`zip missing: ${outZip}`);
    return outZip;
}

async function main() {
    loadEnv();
    const region = process.env.AWS_REGION || REGION;
    const apiBase = String(process.env.API_BASE_URL || '').replace(/\/$/, '');
    const token = String(process.env.CONTRATOS_VENCIMIENTO_TOKEN || process.env.INTERNAL_TOKEN || '').trim();
    const from = String(process.env.SES_FROM_EMAIL || '').trim();
    if (!apiBase) throw new Error('API_BASE_URL requerido');
    if (!token) throw new Error('CONTRATOS_VENCIMIENTO_TOKEN requerido');
    if (!from) throw new Error('SES_FROM_EMAIL requerido');

    const lambda = new LambdaClient({ region });
    const iam = new IAMClient({ region });
    const scheduler = new SchedulerClient({ region });
    const emailFn = await lambda.send(
        new GetFunctionCommand({ FunctionName: process.env.EMAIL_LAMBDA_FUNCTION_NAME || 'EmailExecNovedades' })
    );
    const accountId = emailFn.Configuration.FunctionArn.split(':')[4];

    const assume = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole'
            }
        ]
    });
    let roleArn;
    try {
        roleArn = (await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }))).Role.Arn;
    } catch (e) {
        if (e.name !== 'NoSuchEntityException' && e.Error?.Code !== 'NoSuchEntity') throw e;
        roleArn = (
            await iam.send(
                new CreateRoleCommand({
                    RoleName: ROLE_NAME,
                    AssumeRolePolicyDocument: assume,
                    Description: 'AUT-319 contratos por vencer'
                })
            )
        ).Role.Arn;
        await iam.send(
            new AttachRolePolicyCommand({
                RoleName: ROLE_NAME,
                PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
            })
        );
        await new Promise((r) => setTimeout(r, 8000));
    }
    await iam.send(
        new PutRolePolicyCommand({
            RoleName: ROLE_NAME,
            PolicyName: `${PREFIX}-ses`,
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{ Effect: 'Allow', Action: ['ses:SendEmail', 'ses:SendRawEmail'], Resource: '*' }]
            })
        })
    );

    const zipPath = zipLambda();
    const env = {
        API_BASE_URL: apiBase,
        CONTRATOS_VENCIMIENTO_TOKEN: token,
        SES_FROM_EMAIL: from,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
    };
    let fnArn;
    try {
        await lambda.send(new GetFunctionCommand({ FunctionName: FN_NAME }));
        await lambda.send(
            new UpdateFunctionCodeCommand({ FunctionName: FN_NAME, ZipFile: fs.readFileSync(zipPath) })
        );
        const upd = await lambda.send(
            new UpdateFunctionConfigurationCommand({
                FunctionName: FN_NAME,
                Timeout: 60,
                MemorySize: 256,
                Environment: { Variables: env }
            })
        );
        fnArn = upd.FunctionArn;
    } catch (e) {
        if (e.name !== 'ResourceNotFoundException') throw e;
        const created = await lambda.send(
            new CreateFunctionCommand({
                FunctionName: FN_NAME,
                Role: roleArn,
                Runtime: 'nodejs20.x',
                Handler: 'index.handler',
                Timeout: 60,
                MemorySize: 256,
                Code: { ZipFile: fs.readFileSync(zipPath) },
                Environment: { Variables: env },
                Description: 'AUT-319 digest T30/T15/T5'
            })
        );
        fnArn = created.FunctionArn;
    }

    const schedulerRoleName = `${PREFIX}-scheduler-role`;
    let schedulerRoleArn;
    try {
        schedulerRoleArn = (await iam.send(new GetRoleCommand({ RoleName: schedulerRoleName }))).Role.Arn;
    } catch (e) {
        if (e.name !== 'NoSuchEntityException' && e.Error?.Code !== 'NoSuchEntity') throw e;
        const assumeSched = JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Service: 'scheduler.amazonaws.com' },
                    Action: 'sts:AssumeRole'
                }
            ]
        });
        schedulerRoleArn = (
            await iam.send(
                new CreateRoleCommand({
                    RoleName: schedulerRoleName,
                    AssumeRolePolicyDocument: assumeSched,
                    Description: 'AUT-319 EventBridge → contratos-vencimiento'
                })
            )
        ).Role.Arn;
        await new Promise((r) => setTimeout(r, 8000));
    }
    await iam.send(
        new PutRolePolicyCommand({
            RoleName: schedulerRoleName,
            PolicyName: `${PREFIX}-invoke`,
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    { Effect: 'Allow', Action: ['lambda:InvokeFunction'], Resource: [fnArn, `${fnArn}:*`] }
                ]
            })
        })
    );

    const input = {
        Name: SCHEDULE_NAME,
        GroupName: SCHEDULE_GROUP,
        ScheduleExpression: 'cron(0 13 * * ? *)',
        ScheduleExpressionTimezone: 'America/Bogota',
        FlexibleTimeWindow: { Mode: 'OFF' },
        State: 'ENABLED',
        Target: { Arn: fnArn, RoleArn: schedulerRoleArn, Input: '{}' },
        Description: 'AUT-319 daily T30/T15/T5 processor'
    };
    try {
        await scheduler.send(new GetScheduleCommand({ Name: SCHEDULE_NAME, GroupName: SCHEDULE_GROUP }));
        await scheduler.send(new UpdateScheduleCommand(input));
    } catch (e) {
        if (e.name !== 'ResourceNotFoundException') throw e;
        await scheduler.send(new CreateScheduleCommand(input));
    }

    try {
        await lambda.send(
            new AddPermissionCommand({
                FunctionName: FN_NAME,
                StatementId: 'AllowEventBridgeScheduler',
                Action: 'lambda:InvokeFunction',
                Principal: 'scheduler.amazonaws.com',
                SourceArn: `arn:aws:scheduler:${region}:${accountId}:schedule/${SCHEDULE_GROUP}/${SCHEDULE_NAME}`
            })
        );
    } catch (e) {
        if (e.name !== 'ResourceConflictException') console.warn('AddPermission', e.message);
    }

    const out = { ok: true, function: FN_NAME, schedule: SCHEDULE_NAME, region, apiBase };
    fs.writeFileSync(path.join(ROOT, 'logs', 'contratos-vencimiento-deploy-result.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
