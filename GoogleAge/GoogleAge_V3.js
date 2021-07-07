var ScribeSpeak;
var token;
var TIME_ELAPSED;
var FULL_RECO;
var PARTIAL_RECO;
var TIMEOUT_SEC = 10000;

exports.init = function() {
    info('[ GoogleAge ] is initializing ...');
}

exports.action = function(data, callback, config, SARAH) {

    ScribeSpeak = SARAH.ScribeSpeak;

    FULL_RECO = SARAH.context.scribe.FULL_RECO;
    PARTIAL_RECO = SARAH.context.scribe.PARTIAL_RECO;
    TIME_ELAPSED = SARAH.context.scribe.TIME_ELAPSED;

    SARAH.context.scribe.activePlugin('GoogleAge');

    var util = require('util');
    console.log("GoogleAge call log: " + util.inspect(data, {
        showHidden: true,
        depth: null
    }));

    SARAH.context.scribe.hook = function(event) {
        checkScribe(event, data.action, callback, SARAH, data.want);
    };

    token = setTimeout(function() {
        SARAH.context.scribe.hook("TIME_ELAPSED");
    }, TIMEOUT_SEC);

}

function checkScribe(event, action, callback, SARAH, want) {

    if (event == FULL_RECO) {
        clearTimeout(token);
        SARAH.context.scribe.hook = undefined;
        // aurait-on trouvé ?
        decodeScribe(SARAH, SARAH.context.scribe.lastReco, callback, want);

    } else if (event == TIME_ELAPSED) {
        // timeout !
        SARAH.context.scribe.hook = undefined;
        // aurait-on compris autre chose ?
        if (SARAH.context.scribe.lastPartialConfidence >= 0.7 && SARAH.context.scribe.compteurPartial > SARAH.context.scribe.compteur) {
            decodeScribe(SARAH, SARAH.context.scribe.lastPartial, callback, want);
        } else {
            SARAH.context.scribe.activePlugin('Aucun (GoogleAge)');
            //ScribeSpeak("Désolé je n'ai pas compris. Merci de réessayer.", true);
            return callback({ 'tts': "" });
        }

    } else {
        // pas traité
    }
}

function decodeScribe(SARAH, search, callback, want) {

    console.log("Search: " + search);
    if (want == "age") {
        var rgxp = /(âge|age)( a| de)? (.+)/i;
    } else if (want == "dob") {
        var rgxp = /(naissance|né|née)( à| a| de| au)? (.+)/i;
    }

    var match = search.match(rgxp);
    if (!match || match.length <= 1) {
        SARAH.context.scribe.activePlugin('Aucun (GoogleAge)');
        //ScribeSpeak("Désolé je n'ai pas compris.", true);
        return callback({
            'tts': "Désolé je n'ai pas compris."
        });
    }
    search = match[3].replace('quand', '').trim();
    return agegoogle(callback, search, want);
}

function agegoogle(callback, searchperson, want) {
    if (want == "age") {
        search = "Age de " + searchperson;
    } else if (want == "dob") {
        // On vérifie si on n'a pas déjà enregistré la Date de naissance de x
        var fs = require("fs");
        var path = require('path');
        var filePath = __dirname + "/DatesNaissancesSave.json";
        var file_content;

        file_content = fs.readFileSync(filePath, 'utf8');
        file_content = JSON.parse(file_content);

        if (typeof file_content[searchperson] != 'undefined' && file_content[searchperson] != "") {
            var infos = file_content[searchperson];
            console.log("Informations: " + infos);
            //ScribeSpeak(infos);
            callback({
                'tts': infos
            });
            return;
        } else {
            search = "Date de naissance de " + searchperson;
        }
    }

    var url = "https://www.google.fr/search?q=" + encodeURI(search) + "&btnG=Rechercher&gbv=1";
    console.log('Url Request: ' + url);

    var request = require('request');
    var cheerio = require('cheerio');

    var options = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36',
        'Accept-Charset': 'utf-8'
    };

    request({
        'uri': url,
        'headers': options
    }, function(error, response, html) {

        if (error || response.statusCode != 200) {
            //ScribeSpeak("La requête vers Google a échoué. Erreur " + response.statusCode);
            callback({
                'tts': "La requête vers Google a échoué. Erreur " + response.statusCode
            });
            return;
        }
        var $ = cheerio.load(html);

        var informations = $('._OKe ._cFb ._XWk').text().trim();

        if (informations == "") {
            console.log("Impossible de récupérer les informations sur Google");
            //ScribeSpeak("Désolé, je n'ai pas réussi à récupérer d'informations");
            callback({
                'tts': "Désolé, je n'ai pas réussi à récupérer d'informations"
            });
        } else {
            console.log("Informations: " + informations);

            if (want == "age") {
                var splitinfos = informations.replace('ans', '').split('(');
                var age = splitinfos[0].trim();
                var dates = splitinfos[1].replace(')', '').trim();
                var reponse = searchperson + " a " + age + " ans"; // Réponse à dire

            } else if (want == "dob") {
                var reponse = searchperson + " est né le " + informations; // Réponse à dire

                // On sauvegarde sa date de naissance
                file_content[searchperson] = reponse;
                chaine = JSON.stringify(file_content, null, '\t');
                fs.writeFile(filePath, chaine, function(err) {
                    console.log("[ GoogleAge ] Informations enregistrés");
                });
            }

            //ScribeSpeak(reponse);
            callback({ 'tts': reponse });
        }
        return;
    });
}
