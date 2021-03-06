/**
* Button.tsx
*
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT license.
*
* RN-specific implementation of the cross-platform Button abstraction.
*/

import assert = require('assert');
import React = require('react');
import RN = require('react-native');
import PropTypes = require('prop-types');

import AccessibilityUtil from './AccessibilityUtil';
import Animated from './Animated';
import AppConfig from '../common/AppConfig';
import Styles from './Styles';
import Types = require('../common/Types');
import { isEqual } from '../common/lodashMini';
import UserInterface from './UserInterface';

const _styles = {
    defaultButton: Styles.createButtonStyle({
        alignItems: 'stretch',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: 'rgba(0, 0, 0, 0)'
    }),
    disabled: Styles.createButtonStyle({
        opacity: 0.5
    })
};

const _defaultAccessibilityTrait = Types.AccessibilityTrait.Button;
const _defaultImportantForAccessibility = Types.ImportantForAccessibility.Yes;

const _defaultActiveOpacity = 0.2;
const _inactiveOpacityAnimationDuration = 250;
const _activeOpacityAnimationDuration = 0;
const _hideUnderlayTimeout = 100;
const _underlayInactive = 'transparent';

function noop() { /* noop */ }

function applyMixin(thisObj: any, mixin: {[propertyName: string]: any}, propertiesToSkip: string[]) {
    Object.getOwnPropertyNames(mixin).forEach(name => {
        if (name !== 'constructor' && propertiesToSkip.indexOf(name) === -1) {
            assert(
                !(name in thisObj),
                `An object cannot have a method with the same name as one of its mixins: "${name}"`
            );
            thisObj[name] = mixin[name].bind(thisObj);
        }
    });
}

export interface ButtonContext {
    hasRxButtonAscendant?: boolean;
}

export class Button extends React.Component<Types.ButtonProps, {}> {
    static propTypes = {
        // Button should only have a single child.
        children: PropTypes.element
    };

    static contextTypes = {
        hasRxButtonAscendant: PropTypes.bool
    };

    static childContextTypes = {
        hasRxButtonAscendant: PropTypes.bool
    };

    private _mixin_componentDidMount = RN.Touchable.Mixin.componentDidMount || noop;
    private _mixin_componentWillUnmount = RN.Touchable.Mixin.componentWillUnmount || noop;

    touchableGetInitialState: () => RN.Touchable.State;
    touchableHandleStartShouldSetResponder: () => boolean;
    touchableHandleResponderTerminationRequest: () => boolean;
    touchableHandleResponderGrant: (e: React.SyntheticEvent<any>) => void;
    touchableHandleResponderMove: (e: React.SyntheticEvent<any>) => void;
    touchableHandleResponderRelease: (e: React.SyntheticEvent<any>) => void;
    touchableHandleResponderTerminate: (e: React.SyntheticEvent<any>) => void;

    private _isMounted = false;
    private _hideTimeout: number|undefined;
    private _buttonElement: RN.Animated.View|undefined;
    private _defaultOpacityValue: number|undefined;
    private _opacityAnimatedValue: RN.Animated.Value|undefined;
    private _opacityAnimatedStyle: Types.AnimatedViewStyleRuleSet|undefined;

    constructor(props: Types.ButtonProps, context: ButtonContext) {
        super(props, context);
        applyMixin(this, RN.Touchable.Mixin, [
            // Properties that Button and RN.Touchable.Mixin have in common. Button needs
            // to dispatch these methods to RN.Touchable.Mixin manually.
            'componentDidMount',
            'componentWillUnmount'
        ]);
        this.state = this.touchableGetInitialState();
        this._setOpacityStyles(props);

        if (context.hasRxButtonAscendant) {
            if (AppConfig.isDevelopmentMode()) {
                console.warn('Button components should not be embedded. Some APIs, e.g. Accessibility, will not work.');
            }
        }
    }

    render() {
        // Accessibility props.
        const importantForAccessibility = AccessibilityUtil.importantForAccessibilityToString(this.props.importantForAccessibility,
            _defaultImportantForAccessibility);
        const accessibilityTrait = AccessibilityUtil.accessibilityTraitToString(this.props.accessibilityTraits,
             _defaultAccessibilityTrait);
        const accessibilityComponentType = AccessibilityUtil.accessibilityComponentTypeToString(this.props.accessibilityTraits,
            _defaultAccessibilityTrait);

        const opacityStyle = !this.props.disableTouchOpacityAnimation && this._opacityAnimatedStyle;

        return (
            <RN.Animated.View
                ref={ this._onButtonRef }
                style={ Styles.combine([_styles.defaultButton, this.props.style, opacityStyle,
                    this.props.disabled && _styles.disabled]) }
                accessibilityLabel={ this.props.accessibilityLabel || this.props.title }
                accessibilityTraits={ accessibilityTrait }
                accessibilityComponentType={ accessibilityComponentType }
                importantForAccessibility={ importantForAccessibility }
                onStartShouldSetResponder={ this.touchableHandleStartShouldSetResponder }
                onResponderTerminationRequest={ this.touchableHandleResponderTerminationRequest }
                onResponderGrant={ this.touchableHandleResponderGrant }
                onResponderMove={ this.touchableHandleResponderMove }
                onResponderRelease={ this.touchableHandleResponderRelease }
                onResponderTerminate={ this.touchableHandleResponderTerminate }
                shouldRasterizeIOS={ this.props.shouldRasterizeIOS }
                onAccessibilityTapIOS={ this.props.onAccessibilityTapIOS }
            >
                { this.props.children }
            </RN.Animated.View>
        );
    }

    componentDidMount() {
        this._mixin_componentDidMount();
        this._isMounted = true;
    }

    componentWillUnmount() {
        this._mixin_componentWillUnmount();
        this._isMounted = false;
    }

    componentWillReceiveProps(nextProps: Types.ButtonProps) {
        if (!isEqual(this.props, nextProps)) {
            // If opacity got updated as a part of props update, we need to reflect that in the opacity animation value
           this._setOpacityStyles(nextProps, this.props);
        }
    }

    getChildContext(): ButtonContext {
        return { hasRxButtonAscendant: true };
    }

    setNativeProps(nativeProps: RN.ViewProps) {
        if (this._buttonElement) {
            this._buttonElement.setNativeProps(nativeProps);
        }
    }

    touchableHandleActivePressIn = (e: Types.SyntheticEvent) => {
        if (this._isTouchFeedbackApplicable()) {
            if (this.props.underlayColor) {
                if (this._hideTimeout) {
                    clearTimeout(this._hideTimeout);
                    this._hideTimeout = undefined;
                }
                this._showUnderlay();
            }

             // We do not want to animate opacity if underlayColour is provided. Unless an explicit activeOpacity is provided
            if (!this.props.disableTouchOpacityAnimation && (this.props.activeOpacity || !this.props.underlayColor)) {
                this._opacityActive(_activeOpacityAnimationDuration);
            }
        }

        if (!this.props.disabled && this.props.onPressIn) {
            this.props.onPressIn(e);
        }
    }

    touchableHandleActivePressOut = (e: Types.SyntheticEvent) => {
        if (this._isTouchFeedbackApplicable()) {
            if (this.props.underlayColor) {
                if (this._hideTimeout) {
                    clearTimeout(this._hideTimeout);
                }
                this._hideTimeout = setTimeout(this._hideUnderlay, _hideUnderlayTimeout);
            }

            if (!this.props.disableTouchOpacityAnimation && (this.props.activeOpacity || !this.props.underlayColor)) {
                this._opacityInactive(_inactiveOpacityAnimationDuration);
            }
        }

        if (!this.props.disabled && this.props.onPressOut) {
            this.props.onPressOut(e);
        }
    }

    touchableHandlePress = (e: Types.MouseEvent) => {
        UserInterface.evaluateTouchLatency(e);
        if (!this.props.disabled && this.props.onPress) {
            this.props.onPress(e);
        }
    }

    touchableHandleLongPress = (e: Types.MouseEvent) => {
        if (!this.props.disabled && this.props.onLongPress) {
            this.props.onLongPress(e);
        }
    }

    touchableGetHighlightDelayMS = () => {
        return 20;
    }

    touchableGetPressRectOffset = () => {
        return {top: 20, left: 20, right: 20, bottom: 100};
    }

    focus() {
        AccessibilityUtil.setAccessibilityFocus(this);
    }

    blur() {
         // native mobile platforms doesn't have the notion of blur for buttons, so ignore.
    }

    private _setOpacityStyles(props: Types.ButtonProps, prevProps?: Types.ButtonProps) {
        const opacityValueFromProps = this._getDefaultOpacityValue(props);
        if (this._defaultOpacityValue !== opacityValueFromProps || (prevProps && props.disabled !== prevProps.disabled)) {
            this._defaultOpacityValue = opacityValueFromProps;
            this._opacityAnimatedValue = new Animated.Value(this._defaultOpacityValue);
            this._opacityAnimatedStyle = Styles.createAnimatedViewStyle({
                opacity: this._opacityAnimatedValue
            });
        }
    }

    private _onButtonRef = (btn: RN.Animated.View): void => {
        this._buttonElement = btn;
    }

    private _isTouchFeedbackApplicable() {
        return this._isMounted && this._hasPressHandler() && this._buttonElement;
    }

    private _opacityActive(duration: number) {
        this.setOpacityTo(this.props.activeOpacity || _defaultActiveOpacity, duration);
    }

    private _opacityInactive(duration: number) {
        this.setOpacityTo(this._defaultOpacityValue!!!, duration);
    }

    private _getDefaultOpacityValue(props: Types.ButtonProps): number {
        let flattenedStyles: { [key: string]: any }|undefined;
        if (props && props.style) {
            flattenedStyles = RN.StyleSheet.flatten(props.style);
        }

        return flattenedStyles && (flattenedStyles as Types.ButtonStyle).opacity || 1;
    }

    /**
    * Animate the touchable to a new opacity.
    */
    setOpacityTo(value: number, duration: number) {
       Animated.timing(
            this._opacityAnimatedValue!!!,
            {
                toValue: value,
                duration: duration,
                easing: Animated.Easing.InOut()
            }
        ).start();
    }

    private _hasPressHandler() {
        return !!(
            this.props.onPress ||
            this.props.onPressIn ||
            this.props.onPressOut ||
            this.props.onLongPress
        );
    }

    private _showUnderlay() {
        if (!this._buttonElement) {
            return;
        }

        this._buttonElement.setNativeProps({
            style: {
                backgroundColor: this.props.underlayColor
            }
        });
    }

    private _hideUnderlay = () => {
        if (!this._isMounted || !this._buttonElement) {
            return;
        }

        this._buttonElement.setNativeProps({
            style: [{
                backgroundColor: _underlayInactive
            }, this.props.style],
        });
    }
}

export default Button;
