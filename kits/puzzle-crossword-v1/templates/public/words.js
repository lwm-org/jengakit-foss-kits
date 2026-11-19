/**
 * CrosswordWords — Default word lists for crossword puzzle generation.
 * The LLM can override this by generating a custom words.js with themed words.
 * Each difficulty has a word list: [{word, clue}, ...]
 * The crossword engine (in index.html) builds the grid algorithmically at runtime.
 */
var WORD_LISTS = {
  easy: [
    {word:'CODE',clue:'What developers write'},
    {word:'DATA',clue:'Information stored digitally'},
    {word:'PORT',clue:'Network endpoint number'},
    {word:'NODE',clue:'JavaScript runtime'},
    {word:'BYTE',clue:'Eight bits of data'},
    {word:'PAGE',clue:'Web document'},
    {word:'EDIT',clue:'Modify content'},
    {word:'LOOP',clue:'Repeated execution'},
    {word:'TYPE',clue:'Data classification'},
    {word:'FILE',clue:'Stored document on disk'},
    {word:'ICON',clue:'Small graphic symbol'},
    {word:'LINK',clue:'Connection between pages'},
    {word:'SORT',clue:'Arrange in order'},
    {word:'LOAD',clue:'Fetch into memory'},
    {word:'SAVE',clue:'Store to disk'}
  ],
  medium: [
    {word:'DOCKER',clue:'Container platform'},
    {word:'PYTHON',clue:'Snake-named language'},
    {word:'SERVER',clue:'Request handler computer'},
    {word:'DEPLOY',clue:'Release to production'},
    {word:'LINUX',clue:'Open source OS'},
    {word:'REDIS',clue:'In-memory data store'},
    {word:'REACT',clue:'Facebook UI library'},
    {word:'TOKEN',clue:'Auth credential string'},
    {word:'CACHE',clue:'Fast temporary storage'},
    {word:'CLOUD',clue:'Remote computing platform'},
    {word:'NGINX',clue:'Popular web server'},
    {word:'ARRAY',clue:'Ordered list structure'},
    {word:'QUERY',clue:'Database request'},
    {word:'STACK',clue:'LIFO data structure'},
    {word:'ROUTE',clue:'URL path mapping'}
  ],
  hard: [
    {word:'CONTAINERS',clue:'Isolated app runtimes'},
    {word:'ALGORITHM',clue:'Step-by-step procedure'},
    {word:'TERRAFORM',clue:'Infrastructure as code'},
    {word:'WEBSOCKET',clue:'Full-duplex protocol'},
    {word:'DATABASE',clue:'Organized data system'},
    {word:'FUNCTION',clue:'Reusable code block'},
    {word:'DEVOPS',clue:'Dev plus Operations'},
    {word:'DOCKER',clue:'Container platform'},
    {word:'PYTHON',clue:'Snake-named language'},
    {word:'SERVER',clue:'Request handler'},
    {word:'DEPLOY',clue:'Release to production'},
    {word:'REDIS',clue:'In-memory store'},
    {word:'CLOUD',clue:'Remote computing'},
    {word:'REACT',clue:'UI library'},
    {word:'TOKEN',clue:'Auth credential'},
    {word:'PROXY',clue:'Intermediary server'},
    {word:'NGINX',clue:'Web server'}
  ]
};
