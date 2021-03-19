/* eslint-disable */
function details() {
  return {
    id: "Tdarr_Plugin_DOOM_Clean_Audio_Channels",
    Name: "DOOM Remove audio tracks of lower channels",
    Stage: "Pre-processing",
    Type: "Audio",
    Operation: "",
    Description:
	"Will keep only the highest number of channel audio tracks for each language.",
    Version: "2.0",
	Tags: "pre-processing,ffmpeg,audio",
    Inputs: [
      {
      },
    ],
  };
}

// #region Helper Classes/Modules

/**
 * Handles logging in a standardised way.
 */
class Log {
  constructor() {
    this.entries = [];
  }

  /**
   *
   * @param {String} entry the log entry string
   */
  Add(entry) {
    this.entries.push(entry);
  }

  /**
   *
   * @param {String} entry the log entry string
   */
  AddSuccess(entry) {
    this.entries.push(`☑ ${entry}`);
  }

  /**
   *
   * @param {String} entry the log entry string
   */
  AddError(entry) {
    this.entries.push(`☒ ${entry}`);
  }

  /**
   * Returns the log lines separated by new line delimiter.
   */
  GetLogData() {
    return this.entries.join("\n");
  }
}

/**
 * Handles the storage of FFmpeg configuration.
 */
class Configurator {
  constructor(defaultOutputSettings = null) {
    this.shouldProcess = false;
    this.outputSettings = defaultOutputSettings || [];
    this.inputSettings = [];
  }

  AddInputSetting(configuration) {
    this.inputSettings.push(configuration);
  }

  AddOutputSetting(configuration) {
    this.shouldProcess = true;
    this.outputSettings.push(configuration);
  }

  ResetOutputSetting(configuration) {
    this.shouldProcess = false;
    this.outputSettings = configuration;
  }

  RemoveOutputSetting(configuration) {
    var index = this.outputSettings.indexOf(configuration);

    if (index === -1) return;
    this.outputSettings.splice(index, 1);
  }

  GetOutputSettings() {
    return this.outputSettings.join(" ");
  }

  GetInputSettings() {
    return this.inputSettings.join(" ");
  }
}

// #endregion

// #region Plugin Methods

/**
 * Loops over the file streams and executes the given method on
 * each stream when the matching codec_type is found.
 * @param {Object} file the file.
 * @param {string} type the typeo of stream.
 * @param {function} method the method to call.
 */
function loopOverStreamsOfType(file, type, method) {
  var id = 0;
  for (var i = 0; i < file.ffProbeData.streams.length; i++) {
    if (file.ffProbeData.streams[i].codec_type.toLowerCase() === type) {
      method(file.ffProbeData.streams[i], id);
      id++;
    }
  }
}

/**
 * Removes audio tracks that aren't in the allowed languages or labeled as Commentary tracks.
 * Transcode audio if specified.
 */
function buildAudioConfiguration(inputs, file, logger) {
  var configuration = new Configurator(["-c:a copy"]);
  var stream_count = 0;
  var streams_removing = 0;
  var languages = inputs.audio_language.split(",");
  
  /* Build array of audio streams */
  
  var language_max = {};
  
  for (var i = 0; i < file.ffProbeData.streams.length; i++) {
    if (file.ffProbeData.streams[i].codec_type.toLowerCase() === "audio") {
		if file.ffProbeData.streams[i].language in language_max {
			language_max[file.ffProbeData.streams[i].language] = Math.max(language_max[file.ffProbeData.streams[i].language],int(file.ffProbeData.streams[i].channels));
		} else {
			language_max[file.ffProbeData.streams[i].language] = int(file.ffProbeData.streams[i].channels);
		}
    }
  }
  
  function audioProcess(stream, id) {
	stream_count++;
    if (int(stream.channels) < language_max[stream.language]) {
        streams_removing++;
        configuration.AddOutputSetting(`-map -0:a:${id}`);
        logger.AddError(`Removing audio track: ${stream.tags.title}`);
    }
  }
  
  loopOverStreamsOfType(file, "audio", audioProcess);  

  if (stream_count == streams_removing) {
    logger.AddError(
      `*** All audio tracks would have been removed.  Defaulting to keeping all tracks for this file.`
    );
  configuration.ResetOutputSetting(["-c:a copy"]);
  }

  return configuration;
}


function buildSubtitleConfiguration(inputs, file, logger) {
  var configuration = new Configurator(["-c:s copy"]);
  return configuration;
}

function buildVideoConfiguration(inputs, file, logger) {
	var configuration = new Configurator(["-map 0", "-map -0:d", "-c:v copy"]);
  return configuration;
}

//#endregion

function plugin(file, _librarySettings, inputs) {
  var response = {
    container: ".mkv",
    FFmpegMode: true,
    handBrakeMode: false,
    infoLog: "",
    processFile: false,
    preset: "",
    reQueueAfter: true,
  };

  var logger = new Log();
  var audioSettings = buildAudioConfiguration(inputs, file, logger);
  var videoSettings = buildVideoConfiguration(inputs, file, logger);
  var subtitleSettings = buildSubtitleConfiguration(inputs, file, logger);

  response.preset  = `${videoSettings.GetInputSettings()},${videoSettings.GetOutputSettings()}`
  response.preset += ` ${audioSettings.GetOutputSettings()}`
  response.preset += ` ${subtitleSettings.GetOutputSettings()}`
  response.preset += ` -max_muxing_queue_size 9999`;
  
  // b frames argument
  response.preset += ` -bf 5`;
  
  // fix probe size errors
  response.preset += ` -analyzeduration 2147483647 -probesize 2147483647`;
  
  response.processFile =
    audioSettings.shouldProcess ||
    videoSettings.shouldProcess ||
    subtitleSettings.shouldProcess;

  if (!response.processFile) {
    logger.AddSuccess("No need to process file");
  }

  response.infoLog += logger.GetLogData();
  return response;
}

module.exports.details = details;
module.exports.plugin = plugin;
