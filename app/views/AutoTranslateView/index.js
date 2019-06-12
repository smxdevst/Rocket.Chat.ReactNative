/* eslint-disable react/sort-comp */
import PropTypes from 'prop-types';
import React from 'react';
import {
	InteractionManager, ScrollView, Text, TouchableOpacity, View
} from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { SafeAreaView } from 'react-navigation';
import { connect } from 'react-redux';
import sharedStyles from '../Styles';
import SwitchContainer from '../SwitchContainer';
import RCActivityIndicator from '../../containers/ActivityIndicator';
import Loading from '../../containers/Loading';
import StatusBar from '../../containers/StatusBar';
import RCTextInput from '../../containers/TextInput';
import I18n from '../../i18n';
import database, { safeAddListener } from '../../lib/realm';
import RocketChat from '../../lib/rocketchat';
import KeyboardView from '../../presentation/KeyboardView';
import debounce from '../../utils/debounce';
import { showErrorAlert, Toast } from '../../utils/info';
import log from '../../utils/log';
import scrollPersistTaps from '../../utils/scrollPersistTaps';

@connect(state => ({
	userLanguage: state.login.user && state.login.user.language
}))

/** @extends React.Component */
export default class AutoTranslateView extends React.Component {
	static navigationOptions = () => ({ title: I18n.t('Auto_translate') });

	static propTypes = {
		navigation: PropTypes.object,
		userLanguage: PropTypes.string,
		languages: PropTypes.arrayOf(PropTypes.object)
	}

	constructor(props) {
		super(props);
		const rid = props.navigation.getParam('rid');
		let room = props.navigation.getParam('room');
		this.rooms = database.objects('subscriptions').filtered('rid = $0', rid);
		room = this.rooms[0] || room || {};
		this.languages = database.objects('autoTranslateLanguages');
		this.sub = {
			unsubscribe: () => { }
		};
		this.state = {
			room,
			languages: Array.from(this.languages),
			autoTranslate: false,
			saving: false,
			loading: false
		};

		if (room.autoTranslateLanguage) {
			this.state.autoTranslateLanguage = room.autoTranslateLanguage;
		} else if (props.userLanguage) {
			this.state.autoTranslateLanguage = props.userLanguage;
		} else {
			this.state.autoTranslateLanguage = 'en';
		}

		this.mounted = false;
	}

	componentDidMount() {
		safeAddListener(this.rooms, this.updateRoom);
		safeAddListener(this.languages, this.updateLanguages);
		this.mountInteraction = InteractionManager.runAfterInteractions(() => {
			this.init();
			this.mounted = true;
		});
	}

	init = debounce(async() => {
		const { loading, languages, room } = this.state;
		if (loading || !this.mounted) {
			return;
		}

		const {
			autoTranslate, autoTranslateLanguage
		} = room;

		this.setState({
			autoTranslate,
			autoTranslateLanguage
		});

		if (languages && languages.length > 0) {
			return;
		}

		this.setState({ loading: true });

		const result = await fetch('https://translation.googleapis.com/language/translate/v2/languages?key=AIzaSyAWzGtj3FxCbL3JmtTFRiPO88MJQY5gAl4&target=en').then(response => response.json());
		this.loadInteraction = InteractionManager.runAfterInteractions(() => {
			database.write(() => result.data.languages.forEach((language) => {
				try {
					database.create('autoTranslateLanguages', { value: language.language, label: language.name }, true);
				} catch (e) {
					log('AutoTranslateLanguage -> load -> create', e);
				}

				this.setState({
					loading: false
				});
			}));

			this.setState({
				loading: false
			});
		});
	}, 300)

	shouldComponentUpdate(nextProps, nextState) {
		const {
			autoTranslate, autoTranslateLanguage, saving, languages
		} = this.state;

		const { userLanguage } = this.props;
		if (nextState.autoTranslate !== autoTranslate) {
			return true;
		}
		if (nextState.autoTranslateLanguage !== autoTranslateLanguage) {
			return true;
		}
		if (nextState.saving !== saving) {
			return true;
		}
		if (nextState.languages && nextState.languages.length !== languages.length) {
			return true;
		}
		if (nextProps.userLanguage !== userLanguage) {
			return true;
		}
		return false;
	}

	componentWillUnmount() {
		this.rooms.removeAllListeners();
		this.languages.removeAllListeners();
		this.sub.unsubscribe();
		if (this.loadInteraction && this.loadInteraction.cancel) {
			this.loadInteraction.cancel();
		}
	}

	updateRoom = () => {
		if (this.rooms.length > 0) {
			this.setState({ room: JSON.parse(JSON.stringify(this.rooms[0])) });
		}
	}

	updateLanguages = () => {
		this.setState({ languages: Array.from(this.languages) });
	}

	getLabel = (language) => {
		const { languages } = this.state;
		const l = languages.find(i => i.value === language);
		if (l && l.label) {
			return l.label;
		}
		return null;
	}

	formIsChanged = () => {
		const {
			room, autoTranslateLanguage, autoTranslate
		} = this.state;

		return !(
			room.autoTranslateLanguage === autoTranslateLanguage
			&& room.autoTranslate === autoTranslate
		);
	}

	submit = async() => {
		this.setState({ saving: true });

		if (!this.formIsChanged()) {
			return;
		}

		const { room, autoTranslateLanguage, autoTranslate } = this.state;
		const params = {};
		if (room.autoTranslate !== autoTranslate) {
			params.autoTranslate = autoTranslate;
		}
		if (room.autoTranslateLanguage !== autoTranslateLanguage) {
			params.autoTranslateLanguage = autoTranslateLanguage;
		}
		try {
			await RocketChat.saveAutoTranslate(room.rid, params);
			this.setState({ saving: false });
			setTimeout(() => {
				this.toast.show(I18n.t('Preferences_saved'));
			}, 300);
		} catch (e) {
			this.setState({ saving: false });
			setTimeout(() => {
				showErrorAlert(I18n.t('There_was_an_error_while_action', { action: I18n.t('saving_preferences') }));
				log('saveUserPreferences', e);
			}, 300);
		}
	}

	render() {
		const {
			loading,
			room,
			languages,
			autoTranslate,
			autoTranslateLanguage,
			saving
		} = this.state;
		if (!loading && !room) {
			return <View />;
		}
		return (
			<KeyboardView
				contentContainerStyle={sharedStyles.container}
				keyboardVerticalOffset={128}
			>
				<StatusBar />
				<ScrollView
					contentContainerStyle={sharedStyles.containerScrollView}
					testID='auto-translate-view-list'
					{...scrollPersistTaps}
				>
					<SafeAreaView style={sharedStyles.container} testID='auto-translate-view' forceInset={{ bottom: 'never' }}>
						<SwitchContainer
							value={autoTranslate}
							leftLabelPrimary={I18n.t('Disabled')}
							leftLabelSecondary={I18n.t('Messages_will_not_be_auto_translated')}
							rightLabelPrimary={I18n.t('Enabled')}
							rightLabelSecondary={I18n.t('Messages_will_be_auto_translated')}
							onValueChange={value => this.setState({ autoTranslate: value })}
							testID='auto-translate-view-auto-translate'
						/>
						{ languages.length
							? (
								<RNPickerSelect
									items={languages}
									onValueChange={(value) => {
										this.setState({ autoTranslateLanguage: value });
									}}
									value={autoTranslateLanguage}
								>
									<RCTextInput
										inputRef={(e) => { this.name = e; }}
										label={I18n.t('Language')}
										placeholder={I18n.t('Language')}
										value={this.getLabel(autoTranslateLanguage)}
										testID='auto-translate-view-language'
									/>
								</RNPickerSelect>
							)
							: <RCActivityIndicator />
						}
						<TouchableOpacity
							style={sharedStyles.buttonContainer}
							onPress={this.submit}
							disabled={!this.formIsChanged()}
							testID='auto-translate-view-submit'
						>
							<Text style={sharedStyles.button} accessibilityTraits='button'>{I18n.t('SAVE')}</Text>
						</TouchableOpacity>
						<Loading visible={saving} />
						<Toast ref={toast => this.toast = toast} />
					</SafeAreaView>
				</ScrollView>
			</KeyboardView>
		);
	}
}
