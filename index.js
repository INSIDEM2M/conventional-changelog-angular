'use strict';
var compareFunc = require('compare-func');
var Q = require('q');
var readFile = Q.denodeify(require('fs').readFile);
var resolve = require('path').resolve;
var path = require('path');
var pkgJson = {};
var gufg = require('github-url-from-git');
try {
  pkgJson = require(path.resolve(
    process.cwd(),
    './package.json'
  ));
} catch (err) {
  console.error('no root package.json found');
}

var parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?\: (.*)$/,
  headerCorrespondence: [
    'type',
    'scope',
    'subject'
  ],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES'],
  revertPattern: /^revert:\s([\s\S]*?)\s*This reverts commit (\w*)\./,
  revertCorrespondence: ['header', 'hash']
};

function issueUrl() {
  var url = null;
  if (pkgJson.repository && pkgJson.repository.url && ~pkgJson.repository.url.indexOf('github.com')) {
    var gitUrl = gufg(pkgJson.repository.url);

    if (gitUrl) {
      return gitUrl + '/issues/';
    } else {
      return url;
    }
  }
}

var writerOpts = {
  transform: function(commit) {
    var issues = [];

    commit.notes.forEach(function(note) {
      note.title = 'BREAKING CHANGES';
    });

    if (commit.type === 'feat') {
      commit.type = 'Features';
    } else if (commit.type === 'fix') {
      commit.type = 'Bug Fixes';
    } else if (commit.type === 'revert') {
      commit.type = 'Reverts';
    } else if (commit.type === 'test') {
      commit.type = 'Tests';
    } else if (commit.type === 'chore') {
      commit.type = 'Support/Maintenance/Internal';
    } else if(!commit.header || commit.header.match(/^[0-9]+/)) {
      // Version up commit
      return;
    } else {
      commit.type = "Not Specified";
    }

    if (commit.scope === '*') {
      commit.scope = '';
    }

    if (typeof commit.subject === 'string') {
      var url = issueUrl();
      if (url) {
        // TODO: Replace issue with link to issue url
        commit.subject = commit.subject.replace(/#([0-9]+)/g, function(_, issue) {
          issues.push(issue);
          return '[#' + issue + '](' + url + issue + ')';
        });
      }
      // GitHub user URLs.
      // commit.subject = commit.subject.replace(/( ?)@([a-zA-Z0-9_]+)(\b|^)/g, '$1[@$2](https://github.com/$2)$3');
      commit.subject = commit.subject;
    }

    // remove references that already appear in the subject
    commit.references = commit.references.filter(function(reference) {
      if (issues.indexOf(reference.issue) === -1) {
        return true;
      }

      return false;
    });

    return commit;
  },
  groupBy: 'type',
  commitGroupsSort: 'title',
  commitsSort: ['scope', 'subject'],
  noteGroupsSort: 'title',
  notesSort: compareFunc
};

module.exports = Q.all([
  readFile(resolve(__dirname, 'templates/template.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/header.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/commit.hbs'), 'utf-8'),
  readFile(resolve(__dirname, 'templates/footer.hbs'), 'utf-8')
])
  .spread(function(template, header, commit, footer) {

    writerOpts.mainTemplate = template;
    writerOpts.headerPartial = header;
    writerOpts.commitPartial = commit;
    writerOpts.footerPartial = footer;

    return {
      parserOpts: parserOpts,
      writerOpts: writerOpts
    };
  });
