const core = require('@actions/core')
const {GitHub, context} = require('@actions/github')
const jsdiff = require('diff')

process.on('unhandledRejection', handleError)
main().catch(handleError)


async function main() {
    // This action only works on pull_request synchronized events
    if (context.eventName != 'pull_request' || context.payload.action != 'synchronize') {
        console.warn('context:', context);
        core.setFailed('This action requires a pull_request synchronize event');
        return;
    }
    const token = core.getInput('github-token', {required: true});
    const debug = core.getInput('debug');
    const opts = {};
    if (debug === 'true') {
        opts.log = console;
    }
    const client = new GitHub(token, opts);

    console.log(context.payload.repository.owner); //XXX
    const beforeDiff = await client.repos.compareCommits({
        owner: context.payload.repository.owner.name,
        repo: context.payload.repository.name,
        base: context.payload.pull_request.base.sha,
        head: context.payload.before,
        mediaType: {
            format: 'diff'
        }
    });
    const afterDiff = await client.repos.compareCommits({
        owner: context.payload.repository.owner.name,
        repo: context.payload.repository.name,
        base: context.payload.pull_request.base.sha,
        head: context.payload.after,
        mediaType: {
            format: 'diff'
        }
    });
    if (beforeDiff == afterDiff) {
        return;
    }
    const diffDiff = jsdiff.createTwoFilesPatch('before-patch', 'after-patch', beforeDiff, afterDiff);

    // Dismiss any approved reviews of this PR if this push introduced changes
    const options = await client.pulls.listReviews.endpoint.merge({
        owner: context.payload.repository.owner.name,
        repo: context.payload.repository.name,
        pull_number: context.payload.number
    });
    for await (const chunk of client.paginate.iterator(options)) {
        for (const review of chunk.data) {
            if (review.state == 'APPROVED') {
                await client.pulls.dismissReview({
                    owner: context.payload.repository.owner.name,
                    repo: context.payload.repository.name,
                    pull_number: context.payload.number,
                    review_id: review.id,
                    message: diffDiff
                });
            }
        }
    }
}

function handleError(err) {
    console.error(err)
    core.setFailed(err.message)
}